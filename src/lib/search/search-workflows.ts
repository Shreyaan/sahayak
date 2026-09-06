import { and, cosineDistance, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { searchDocumentsTable, workflowVersionsTable } from "@/db/schema";
import { rankCandidates, type CandidateEvidence } from "./ranking";
import { embedSearchQuery } from "./embeddings";
import { parseTrustMetadata, type TrustMetadata, type WorkflowJurisdiction } from "@/lib/trust";
import { redactCitizenText } from "@/lib/citizen-outcomes";

export const searchWorkflowsInputSchema = z.object({
  query: z.string().trim().min(2).max(1_000),
  locale: z.enum(["hi", "en"]),
  stateCode: z.string().trim().min(1).max(16).optional(),
  districtCode: z.string().trim().min(1).max(128).optional(),
  clarificationAttempt: z.number().int().min(0).max(1).default(0),
  limit: z.number().int().min(1).max(3).default(3),
}).strict().superRefine((value, ctx) => {
  if (value.districtCode && !value.stateCode) {
    ctx.addIssue({ code: "custom", path: ["stateCode"], message: "A district search requires its state code." });
  }
});

export type SearchWorkflowsInput = z.input<typeof searchWorkflowsInputSchema>;

export type WorkflowSearchResult = {
  workflowId: string;
  workflowVersionId: string;
  title: string;
  summary: string;
  jurisdiction: WorkflowJurisdiction;
  matchReasons: string[];
  trust: TrustMetadata;
};

export type SearchWorkflowsResponse = {
  results: WorkflowSearchResult[];
  needsLocation: false;
  shouldClarify: boolean;
  clarificationQuestion?: string;
  unsupported?: boolean;
};

type ScoreRow = { workflowVersionId: string; score: number };
let warnedAboutSemanticSimilarity = false;

export async function searchWorkflows(input: SearchWorkflowsInput): Promise<SearchWorkflowsResponse> {
  const parsed = searchWorkflowsInputSchema.parse(input);
  const request = { ...parsed, query: redactCitizenText(parsed.query) };
  const db = getDatabase();
  const publishedVersions = await db.select({
    id: workflowVersionsTable.id,
    workflowId: workflowVersionsTable.workflowId,
    version: workflowVersionsTable.version,
  }).from(workflowVersionsTable).where(eq(workflowVersionsTable.status, "published"));
  const latestByWorkflow = new Map<string, { id: string; version: number }>();
  for (const version of publishedVersions) {
    const current = latestByWorkflow.get(version.workflowId);
    if (!current || version.version > current.version) latestByWorkflow.set(version.workflowId, version);
  }
  const currentVersionIds = [...latestByWorkflow.values()].map(({ id }) => id);
  if (currentVersionIds.length === 0) {
    return { results: [], needsLocation: false, shouldClarify: true };
  }
  const allowedScope = request.districtCode
    ? sql`(
        ${workflowVersionsTable.scope} = 'central'
        OR (${workflowVersionsTable.scope} = 'state' AND ${workflowVersionsTable.stateCode} = ${request.stateCode})
        OR (${workflowVersionsTable.scope} = 'district' AND ${workflowVersionsTable.stateCode} = ${request.stateCode} AND ${workflowVersionsTable.districtCode} = ${request.districtCode})
      )`
    : request.stateCode
      ? sql`(${workflowVersionsTable.scope} = 'central' OR (${workflowVersionsTable.scope} = 'state' AND ${workflowVersionsTable.stateCode} = ${request.stateCode}))`
      : eq(workflowVersionsTable.scope, "central");
  const published = and(
    eq(workflowVersionsTable.status, "published"),
    inArray(workflowVersionsTable.id, currentVersionIds),
    allowedScope,
  );

  const semanticRowsPromise = embedSearchQuery(request.query)
    .then((embedding) => db
      .select({
        workflowVersionId: workflowVersionsTable.id,
        score: sql<number>`max(1 - (${cosineDistance(searchDocumentsTable.embedding, embedding)}))`,
      })
      .from(searchDocumentsTable)
      .innerJoin(workflowVersionsTable, eq(searchDocumentsTable.workflowVersionId, workflowVersionsTable.id))
      .where(and(published, isNotNull(searchDocumentsTable.embedding)))
      .groupBy(workflowVersionsTable.id)
      .orderBy(sql`2 desc`)
      .limit(20) as Promise<ScoreRow[]>)
    .catch((): ScoreRow[] => {
      if (!warnedAboutSemanticSimilarity) {
        console.warn("Semantic similarity unavailable; continuing with lexical retrieval.");
        warnedAboutSemanticSimilarity = true;
      }
      return [];
    });

  const fullTextRows = await db
    .select({
      workflowVersionId: workflowVersionsTable.id,
      score: sql<number>`max(ts_rank_cd(to_tsvector('simple', ${searchDocumentsTable.searchText}), websearch_to_tsquery('simple', ${request.query})))`,
    })
    .from(searchDocumentsTable)
    .innerJoin(workflowVersionsTable, eq(searchDocumentsTable.workflowVersionId, workflowVersionsTable.id))
    .where(and(published, sql`to_tsvector('simple', ${searchDocumentsTable.searchText}) @@ websearch_to_tsquery('simple', ${request.query})`))
    .groupBy(workflowVersionsTable.id)
    .orderBy(sql`2 desc`)
    .limit(20) as ScoreRow[];

  const tokenRows = await db
    .select({
      workflowVersionId: workflowVersionsTable.id,
      score: sql<number>`max((
        select count(*)::float
        from unnest(string_to_array(lower(${request.query}), ' ')) as token
        where char_length(token) > 2
          and lower(${searchDocumentsTable.searchText}) like '%' || token || '%'
      ))`,
    })
    .from(searchDocumentsTable)
    .innerJoin(workflowVersionsTable, eq(searchDocumentsTable.workflowVersionId, workflowVersionsTable.id))
    .where(published)
    .groupBy(workflowVersionsTable.id)
    .having(sql`max((
      select count(*)
      from unnest(string_to_array(lower(${request.query}), ' ')) as token
      where char_length(token) > 2
        and lower(${searchDocumentsTable.searchText}) like '%' || token || '%'
    )) > 0`)
    .orderBy(sql`2 desc`)
    .limit(20) as ScoreRow[];

  const trigramRows = await db
    .select({
      workflowVersionId: workflowVersionsTable.id,
      score: sql<number>`max(word_similarity(lower(${request.query}), lower(${searchDocumentsTable.searchText})))`,
    })
    .from(searchDocumentsTable)
    .innerJoin(workflowVersionsTable, eq(searchDocumentsTable.workflowVersionId, workflowVersionsTable.id))
    .where(published)
    .groupBy(workflowVersionsTable.id)
    .having(sql`max(word_similarity(lower(${request.query}), lower(${searchDocumentsTable.searchText}))) >= 0.18`)
    .orderBy(sql`2 desc`)
    .limit(20) as ScoreRow[];
  const semanticRows = await semanticRowsPromise;

  const evidence = new Map<string, CandidateEvidence>();
  for (const [index, row] of fullTextRows.entries()) {
    evidence.set(row.workflowVersionId, {
      workflowVersionId: row.workflowVersionId,
      fullTextRank: index + 1,
      fullTextMatched: true,
      lexicalScore: Number(row.score),
      trigramRank: null,
      trigramScore: 0,
    });
  }
  for (const [index, row] of tokenRows.entries()) {
    const current = evidence.get(row.workflowVersionId);
    evidence.set(row.workflowVersionId, {
      workflowVersionId: row.workflowVersionId,
      fullTextRank: Math.min(current?.fullTextRank ?? Number.POSITIVE_INFINITY, index + 1),
      fullTextMatched: current?.fullTextMatched ?? false,
      lexicalScore: Math.max(current?.lexicalScore ?? 0, Number(row.score)),
      trigramRank: current?.trigramRank ?? null,
      trigramScore: current?.trigramScore ?? 0,
    });
  }
  for (const [index, row] of trigramRows.entries()) {
    const current = evidence.get(row.workflowVersionId);
    evidence.set(row.workflowVersionId, {
      workflowVersionId: row.workflowVersionId,
      fullTextRank: current?.fullTextRank ?? null,
      fullTextMatched: current?.fullTextMatched ?? false,
      lexicalScore: current?.lexicalScore ?? 0,
      trigramRank: index + 1,
      trigramScore: Number(row.score),
    });
  }
  for (const [index, row] of semanticRows.entries()) {
    const current = evidence.get(row.workflowVersionId);
    evidence.set(row.workflowVersionId, {
      workflowVersionId: row.workflowVersionId,
      fullTextRank: current?.fullTextRank ?? null,
      fullTextMatched: current?.fullTextMatched ?? false,
      lexicalScore: current?.lexicalScore ?? 0,
      trigramRank: current?.trigramRank ?? null,
      trigramScore: current?.trigramScore ?? 0,
      semanticRank: index + 1,
      semanticScore: Number(row.score),
    });
  }

  // Retrieval similarity is not evidence that a citizen has this problem.
  // Bundled synthetic journeys require an affirmative topic mention. Negated
  // topics ("no scholarship or death claim involved") cannot authorize a start.
  const topicText = request.query.replace(/\b(?:no|not|without)\s+(?:(?:a|any)\s+)?(?:scholar\w*|scholor\w*|death|bereavement)[^.!?;\n]*/gi, "");
  const scholarship = /\b(?:scholar\w*|scholor\w*|nsp|pfms|student grant)\b|छात्रवृत्ति|स्कॉलरशिप|वजीफा/i.test(topicText);
  const bereavement = /\b(?:death|died|deceased|bereavement|passed away|mrityu)\b|मृत्यु|निधन|गुज़र|गुजर/i.test(topicText);
  const topicMatches: Record<string, boolean> = {
    scholarship,
    bereavement,
    "aadhaar-update": !scholarship && !bereavement && /\b(?:aadhaar|aadhar|adhar|uidai|myaadhaar)\b|आधार/i.test(topicText) && /update|correct|reject|अपडेट|सुधार|अस्वीकृत|रिजेक्ट/i.test(topicText),
    "epfo-claim": !bereavement && !scholarship && /\b(?:epfo|pf|epfigms|provident fund)\b|पीएफ|भविष्य निधि/i.test(topicText) && /claim|withdraw|settled|paisa|money|payment|दाव|निकासी|पैसा|भुगतान/i.test(topicText),
  };
  const workflowByVersion = new Map(publishedVersions.map((version) => [version.id, version.workflowId]));
  const ranked = rankCandidates([...evidence.values()].filter((candidate) => topicMatches[workflowByVersion.get(candidate.workflowVersionId)!] !== false));
  if (ranked.length === 0 || ranked[0]?.ambiguousWithNext) {
    return {
      results: [],
      needsLocation: false,
      shouldClarify: true,
    };
  }

  const selected = ranked.slice(0, request.limit);
  const displayRows = await db
    .select({
      workflowId: workflowVersionsTable.workflowId,
      workflowVersionId: workflowVersionsTable.id,
      title: searchDocumentsTable.title,
      summary: searchDocumentsTable.summary,
      scope: workflowVersionsTable.scope,
      stateCode: workflowVersionsTable.stateCode,
      districtCode: workflowVersionsTable.districtCode,
      trust: workflowVersionsTable.trust,
    })
    .from(workflowVersionsTable)
    .innerJoin(searchDocumentsTable, and(
      eq(searchDocumentsTable.workflowVersionId, workflowVersionsTable.id),
      eq(searchDocumentsTable.locale, request.locale),
    ))
    .where(and(published, inArray(workflowVersionsTable.id, selected.map((item) => item.workflowVersionId))));
  const byId = new Map(displayRows.map((row) => [row.workflowVersionId, row]));

  return {
    results: selected.flatMap((candidate) => {
      const row = byId.get(candidate.workflowVersionId);
      if (!row) return [];
      const semantic = (candidate.semanticScore ?? 0) >= 0.55;
      const lexical = candidate.fullTextRank !== null;
      return [{
        workflowId: row.workflowId,
        workflowVersionId: row.workflowVersionId,
        title: row.title,
        summary: row.summary,
        jurisdiction: { scope: row.scope, stateCode: row.stateCode, districtCode: row.districtCode },
        trust: parseTrustMetadata(row.trust),
        matchReasons: [
          semantic
            ? (request.locale === "hi" ? "आपकी समस्या का अर्थ इस यात्रा से मेल खाता है" : "The meaning of your problem matches this journey")
            : lexical
            ? (request.locale === "hi" ? "आपके शब्द इस यात्रा से मेल खाते हैं" : "Your words match this journey")
            : (request.locale === "hi" ? "मिलती-जुलती वर्तनी मिली" : "A close spelling matched"),
        ],
      }];
    }),
    needsLocation: false,
    shouldClarify: false,
  };
}
