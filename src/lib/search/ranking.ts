export type CandidateEvidence = {
  workflowVersionId: string;
  fullTextRank: number | null;
  fullTextMatched: boolean;
  lexicalScore: number;
  trigramRank: number | null;
  trigramScore: number;
  semanticRank?: number | null;
  semanticScore?: number;
};

export type RankedCandidate = CandidateEvidence & {
  score: number;
  ambiguousWithNext: boolean;
};

const RRF_K = 60;
const MIN_TRIGRAM_SCORE = 0.24;
const MIN_SEMANTIC_SCORE = 0.55;
const AMBIGUITY_GAP = 0.0005;

export function rankCandidates(candidates: CandidateEvidence[]): RankedCandidate[] {
  const ranked = candidates
    .filter((candidate) =>
      candidate.fullTextMatched
      || candidate.lexicalScore >= 2
      || candidate.trigramScore >= MIN_TRIGRAM_SCORE
      || (candidate.semanticScore ?? 0) >= MIN_SEMANTIC_SCORE,
    )
    .map((candidate) => ({
      ...candidate,
      score:
        (candidate.fullTextRank === null ? 0 : 1 / (RRF_K + candidate.fullTextRank))
        + (candidate.trigramRank === null ? 0 : 1 / (RRF_K + candidate.trigramRank))
        + (candidate.semanticRank == null ? 0 : 1 / (RRF_K + candidate.semanticRank))
        + Math.min(candidate.lexicalScore, 4) * 0.001,
      ambiguousWithNext: false,
    }))
    .sort((left, right) => right.score - left.score || left.workflowVersionId.localeCompare(right.workflowVersionId));

  if (ranked.length > 1 && ranked[0]!.score - ranked[1]!.score <= AMBIGUITY_GAP) {
    ranked[0]!.ambiguousWithNext = true;
  }

  return ranked;
}
