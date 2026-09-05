CREATE UNIQUE INDEX "invitation_pending_organizationId_email_uidx" ON "invitation" USING btree ("organization_id","email") WHERE "invitation"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "member_organizationId_userId_uidx" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.sahayak_cases') IS NOT NULL THEN
    INSERT INTO "citizen_cases" ("id", "workflow_id", "snapshot", "updated_at")
    SELECT "id", "workflow_id", "snapshot", "updated_at" FROM "sahayak_cases"
    ON CONFLICT ("id") DO UPDATE SET
      "workflow_id" = EXCLUDED."workflow_id",
      "snapshot" = EXCLUDED."snapshot",
      "updated_at" = EXCLUDED."updated_at";
  END IF;

  IF to_regclass('public.sahayak_submissions') IS NOT NULL THEN
    INSERT INTO "contributor_submissions" ("created_at", "workflow_id", "input", "draft")
    SELECT old."created_at", old."workflow_id", old."input", old."draft"
    FROM "sahayak_submissions" old
    WHERE NOT EXISTS (
      SELECT 1 FROM "contributor_submissions" current
      WHERE current."created_at" = old."created_at"
        AND current."workflow_id" = old."workflow_id"
        AND current."input" = old."input"
    );
  END IF;

  IF to_regclass('public.sahayak_workflows') IS NOT NULL THEN
    INSERT INTO "legacy_workflow_definitions" ("id", "definition", "created_at")
    SELECT "id", "definition", "created_at" FROM "sahayak_workflows"
    ON CONFLICT ("id") DO UPDATE SET "definition" = EXCLUDED."definition";
  END IF;
END $$;
