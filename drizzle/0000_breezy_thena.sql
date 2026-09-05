CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "search_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_version_id" text NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"search_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"scope" text NOT NULL,
	"state_code" text,
	"district_code" text,
	"definition" jsonb NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_documents" ADD CONSTRAINT "search_documents_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "search_documents_version_locale_idx" ON "search_documents" USING btree ("workflow_version_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_workflow_version_idx" ON "workflow_versions" USING btree ("workflow_id","version");--> statement-breakpoint
CREATE INDEX "workflow_versions_publication_idx" ON "workflow_versions" USING btree ("status","scope");--> statement-breakpoint
CREATE INDEX "search_documents_fts_idx" ON "search_documents" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX "search_documents_trigram_idx" ON "search_documents" USING gin (lower("search_text") gin_trgm_ops);
