ALTER TABLE "review_cases" ADD COLUMN "baseline_workflow_version_id" text;--> statement-breakpoint
ALTER TABLE "review_cases" ADD CONSTRAINT "review_cases_baseline_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("baseline_workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE no action ON UPDATE no action;
-- Pre-0009 revisions do not retain a workflow identity and PostgreSQL cannot
-- recompute the application's canonical content hash. Leave them byte-for-byte
-- intact so the runtime marks them unavailable instead of corrupting pointers.
