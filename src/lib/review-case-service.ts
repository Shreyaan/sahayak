import { redactCitizenText } from "./citizen-outcomes";
import {
  jurisdictionSchema,
  reviewRevisionContentSchema,
  revisionHash,
  type ReviewJurisdiction,
  type ReviewRevisionContent,
} from "./review-case";
import { applyWordingEdit, wordingEditSchema, type WordingEdit } from "./review-comparison";
import { compareWorkflowDefinitions, type WorkflowComparisonRow } from "./review-comparison";
import { searchWorkflows, type SearchWorkflowsInput, type WorkflowSearchResult } from "./search/search-workflows";
import type { TrustMetadata } from "./trust";
import type { WorkflowDefinition } from "./workflow";

export type ReviewStatus = "draft" | "published" | "rejected";

export type ReviewRevision = {
  id: string;
  revision: number;
  contentHash: string;
  content: ReviewRevisionContent;
  createdAt: string;
  editorId: string | null;
};

export type ReviewCase = {
  id: string;
  sourceChannel: "contributor" | "mcp";
  status: ReviewStatus;
  submittedTitle: string | null;
  evidence: string;
  jurisdiction: ReviewJurisdiction;
  baselineWorkflowVersionId: string | null;
  currentRevision: ReviewRevision;
  createdAt: string;
  updatedAt: string;
};

export type CreateReviewCase = {
  id: string;
  sourceChannel: "contributor" | "mcp";
  status: "draft";
  submittedTitle: string | null;
  evidence: string;
  jurisdiction: ReviewJurisdiction;
  revision: Omit<ReviewRevision, "createdAt">;
};

export interface ReviewCaseRepository {
  create(input: CreateReviewCase): Promise<ReviewCase>;
  list(filters: { status?: ReviewStatus; scope?: ReviewJurisdiction["scope"] }): Promise<ReviewCase[]>;
  get(id: string): Promise<ReviewCase | null>;
  saveRevision(input: { caseId: string; expectedHash: string; content: ReviewRevisionContent; editorId: string }): Promise<ReviewCase>;
  selectBaseline(caseId: string, baselineWorkflowVersionId: string | null): Promise<ReviewCase>;
  getPublishedWorkflowVersion(id: string): Promise<{ id: string; workflowId: string; definition: WorkflowDefinition; trust: TrustMetadata } | null>;
}

export type ReviewCaseDetail = ReviewCase & {
  similar: WorkflowSearchResult[];
  baseline: { id: string; workflowId: string; definition: WorkflowDefinition } | null;
  comparison: WorkflowComparisonRow[];
  trustPreview: { status: "pending expert review"; sourceType: "lived experience"; jurisdiction: ReviewJurisdiction; expertSupportCount: 0 };
};

export type CreateReviewCaseInput = {
  submittedTitle?: string;
  input: string;
  jurisdiction: ReviewJurisdiction;
  draft: ReviewRevisionContent;
  sourceChannel?: "contributor" | "mcp";
};

export function createReviewCaseService(
  repository: ReviewCaseRepository,
  dependencies: { searchWorkflows: (input: SearchWorkflowsInput) => Promise<{ results: WorkflowSearchResult[] }> } = { searchWorkflows },
) {
  return {
    async create(input: CreateReviewCaseInput) {
      const jurisdiction = jurisdictionSchema.parse(input.jurisdiction);
      const draft = reviewRevisionContentSchema.parse(input.draft);
      const contentHash = revisionHash(draft);
      return repository.create({
        id: crypto.randomUUID(),
        sourceChannel: input.sourceChannel ?? "contributor",
        status: "draft",
        submittedTitle: input.submittedTitle ? redactCitizenText(input.submittedTitle) : null,
        evidence: redactCitizenText(input.input),
        jurisdiction,
        revision: {
          id: crypto.randomUUID(),
          revision: 1,
          contentHash,
          content: draft,
          editorId: null,
        },
      });
    },

    list(filters: { status?: ReviewStatus; scope?: ReviewJurisdiction["scope"] } = {}) {
      return repository.list(filters);
    },

    get(id: string) {
      return repository.get(id);
    },

    async detail(id: string): Promise<ReviewCaseDetail | null> {
      const review = await repository.get(id);
      if (!review) return null;
      const content = review.currentRevision.content;
      const similar = (await dependencies.searchWorkflows({
        query: `${content.definition.title.en} ${content.definition.subtitle.en}`,
        locale: "en",
        stateCode: review.jurisdiction.stateCode,
        districtCode: review.jurisdiction.districtCode,
        limit: 3,
      })).results.slice(0, 3);
      const selected = review.baselineWorkflowVersionId
        ? await repository.getPublishedWorkflowVersion(review.baselineWorkflowVersionId)
        : null;
      return {
        ...review,
        similar,
        baseline: selected && { id: selected.id, workflowId: selected.workflowId, definition: selected.definition },
        comparison: selected ? compareWorkflowDefinitions(content.definition, selected.definition) : [],
        trustPreview: { status: "pending expert review", sourceType: content.sourceType, jurisdiction: review.jurisdiction, expertSupportCount: 0 },
      };
    },

    async saveWording(input: { caseId: string; expectedHash: string; wording: WordingEdit; editorId: string }) {
      const current = await repository.get(input.caseId);
      if (!current) throw new Error("REVIEW_CASE_NOT_FOUND");
      if (current.status !== "draft") throw new Error("REVIEW_CASE_READ_ONLY");
      if (current.currentRevision.contentHash !== input.expectedHash) throw new Error("STALE_REVISION");
      const definition = applyWordingEdit(current.currentRevision.content.definition, wordingEditSchema.parse(input.wording));
      const content = reviewRevisionContentSchema.parse({
        ...current.currentRevision.content,
        definition,
        title: definition.title,
        summary: definition.subtitle,
        steps: definition.nodes.map((node) => node.title),
      });
      return repository.saveRevision({ caseId: input.caseId, expectedHash: input.expectedHash, content, editorId: input.editorId });
    },

    async selectBaseline(input: { caseId: string; baselineWorkflowVersionId: string | null }) {
      const current = await repository.get(input.caseId);
      if (!current) throw new Error("REVIEW_CASE_NOT_FOUND");
      if (current.status !== "draft") throw new Error("REVIEW_CASE_READ_ONLY");
      return repository.selectBaseline(input.caseId, input.baselineWorkflowVersionId);
    },
  };
}
