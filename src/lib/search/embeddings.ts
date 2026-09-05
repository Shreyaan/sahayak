import { openrouter } from "@openrouter/ai-sdk-provider";
import { embed, embedMany } from "ai";

export const EMBEDDING_MODEL = "baai/bge-m3";
export const EMBEDDING_DIMENSIONS = 1024;

function requireEmbeddingKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required for semantic similarity.");
  }
}

function validateEmbedding(embedding: number[]): number[] {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, received ${embedding.length}.`);
  }
  return embedding;
}

export async function embedSearchQuery(value: string): Promise<number[]> {
  requireEmbeddingKey();
  const result = await embed({
    model: openrouter.textEmbeddingModel(EMBEDDING_MODEL),
    value,
  });
  return validateEmbedding(result.embedding);
}

export async function embedSearchDocuments(values: string[]): Promise<number[][]> {
  requireEmbeddingKey();
  const result = await embedMany({
    model: openrouter.textEmbeddingModel(EMBEDDING_MODEL),
    values,
  });
  return result.embeddings.map(validateEmbedding);
}
