ALTER TABLE "citizen_outcomes" DROP CONSTRAINT "citizen_outcomes_case_id_citizen_cases_id_fk";
--> statement-breakpoint
ALTER TABLE "citizen_outcomes" ADD CONSTRAINT "citizen_outcomes_case_id_citizen_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."citizen_cases"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION prevent_citizen_outcome_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'citizen outcomes are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER citizen_outcomes_append_only
BEFORE UPDATE OR DELETE ON "citizen_outcomes"
FOR EACH ROW EXECUTE FUNCTION prevent_citizen_outcome_mutation();
