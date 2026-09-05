import { describe, expect, test } from "bun:test";
import { rankCandidates } from "./ranking";

describe("rankCandidates", () => {
  test("keeps a strong semantic match even when citizen wording differs", () => {
    const result = rankCandidates([{
      workflowVersionId: "scholarship-v1",
      fullTextRank: null,
      fullTextMatched: false,
      lexicalScore: 0,
      trigramRank: null,
      trigramScore: 0,
      semanticRank: 1,
      semanticScore: 0.72,
    }]);

    expect(result.map((candidate) => candidate.workflowVersionId)).toEqual([
      "scholarship-v1",
    ]);
  });

  test("fuses lexical and typo ranks without exposing weak candidates", () => {
    const result = rankCandidates([
      {
        workflowVersionId: "bereavement-v1",
        fullTextRank: 1,
        fullTextMatched: true,
        lexicalScore: 0.4,
        trigramRank: 2,
        trigramScore: 0.61,
      },
      {
        workflowVersionId: "scholarship-v1",
        fullTextRank: null,
        fullTextMatched: false,
        lexicalScore: 0,
        trigramRank: 1,
        trigramScore: 0.12,
      },
    ]);

    expect(result.map((candidate) => candidate.workflowVersionId)).toEqual([
      "bereavement-v1",
    ]);
  });

  test("marks two nearly tied supported candidates as ambiguous", () => {
    const result = rankCandidates([
      {
        workflowVersionId: "bereavement-v1",
        fullTextRank: 1,
        fullTextMatched: true,
        lexicalScore: 1,
        trigramRank: null,
        trigramScore: 0,
      },
      {
        workflowVersionId: "scholarship-v1",
        fullTextRank: 2,
        fullTextMatched: true,
        lexicalScore: 1,
        trigramRank: null,
        trigramScore: 0,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.ambiguousWithNext).toBe(true);
  });
});
