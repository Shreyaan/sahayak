CREATE TABLE "citizen_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributor_submissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contributor_submissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workflow_id" text NOT NULL,
	"input" text NOT NULL,
	"draft" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_workflow_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
