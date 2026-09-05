CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "search_documents" ADD COLUMN "embedding" vector(1024);
