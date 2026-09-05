CREATE TABLE "review_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"source_channel" text NOT NULL,
	"status" text NOT NULL,
	"scope" text NOT NULL,
	"state_code" text,
	"district_code" text,
	"evidence" text NOT NULL,
	"current_revision_id" text NOT NULL,
	"current_revision_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"revision" integer NOT NULL,
	"content_hash" text NOT NULL,
	"content" jsonb NOT NULL,
	"editor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_revisions" ADD CONSTRAINT "review_revisions_case_id_review_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."review_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_cases_queue_idx" ON "review_cases" USING btree ("status","scope","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_revisions_case_revision_idx" ON "review_revisions" USING btree ("case_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "review_revisions_content_hash_idx" ON "review_revisions" USING btree ("case_id","content_hash");