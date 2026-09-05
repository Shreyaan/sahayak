ALTER TABLE "workflow_versions" ADD COLUMN "trust" jsonb;
--> statement-breakpoint
UPDATE "workflow_versions"
SET "trust" = '{"provenance":"legacy-verification-pending","reviewDate":null,"verificationMethod":"Verification is pending for this legacy workflow version.","currentExpertSupportCount":0,"hasUnresolvedDisagreement":false,"sourceLinks":[]}'::jsonb;
--> statement-breakpoint
UPDATE "workflow_versions"
SET "trust" = CASE "id"
  WHEN 'bereavement-v1' THEN '{"provenance":"official-source-reviewed","reviewDate":"2026-09-04","verificationMethod":"Seeded prototype guidance checked against public official sources.","currentExpertSupportCount":0,"hasUnresolvedDisagreement":false,"sourceLinks":[]}'::jsonb
  WHEN 'scholarship-v1' THEN '{"provenance":"official-source-reviewed","reviewDate":"2026-09-04","verificationMethod":"Seeded prototype guidance checked against public official sources.","currentExpertSupportCount":0,"hasUnresolvedDisagreement":false,"sourceLinks":[{"label":"National Scholarships Portal","url":"https://scholarships.gov.in/Students"},{"label":"National Scholarships Portal: About Us","url":"https://scholarships.gov.in/aboutUs"}]}'::jsonb
END
WHERE "id" IN ('bereavement-v1', 'scholarship-v1');
--> statement-breakpoint
ALTER TABLE "workflow_versions" ALTER COLUMN "trust" SET NOT NULL;
