CREATE TABLE "citizen_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"workflow_version_id" text NOT NULL,
	"step_id" text,
	"kind" text NOT NULL,
	"detail" text,
	"scope" text NOT NULL,
	"state_code" text,
	"district_code" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "citizen_outcomes" ADD CONSTRAINT "citizen_outcomes_case_id_citizen_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."citizen_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen_outcomes" ADD CONSTRAINT "citizen_outcomes_workflow_version_id_workflow_versions_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "citizen_outcomes_case_time_idx" ON "citizen_outcomes" USING btree ("case_id","occurred_at");--> statement-breakpoint
CREATE INDEX "citizen_outcomes_kind_time_idx" ON "citizen_outcomes" USING btree ("kind","occurred_at");