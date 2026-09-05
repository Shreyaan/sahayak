import { z } from "zod";
import type { CitizenOutcome, RecordCitizenOutcome } from "./citizen-outcomes";
import { existingBrowserOwnerHash } from "./browser-owner";

type CitizenOutcomeApi = {
  record(caseId: string, input: RecordCitizenOutcome, ownerHash?: string): Promise<CitizenOutcome>;
  list(caseId: string, ownerHash?: string): Promise<CitizenOutcome[]>;
};

const stepOutcome = z.object({
  kind: z.enum(["worked", "different", "stuck", "skipped"]),
  stepId: z.string().trim().min(1).max(128),
  detail: z.string().trim().max(500).optional(),
}).strict();

const resolution = z.object({
  kind: z.literal("resolved"),
  detail: z.string().trim().max(500).optional(),
}).strict();

const outcomeInput = z.union([stepOutcome, resolution]);
const idSchema = z.string().uuid();

const publicErrors = {
  CASE_NOT_FOUND: [404, "That case was not found."],
  WORKFLOW_VERSION_NOT_FOUND: [409, "The case's workflow version is unavailable."],
  STEP_NOT_REPORTABLE: [409, "That step cannot receive feedback yet."],
  CASE_NOT_RESOLVED: [409, "Resolution can be recorded only after the journey is complete."],
} as const;

function failure(error: unknown) {
  const code = error instanceof Error && error.message in publicErrors
    ? error.message as keyof typeof publicErrors
    : "OUTCOME_UNAVAILABLE";
  const known = code === "OUTCOME_UNAVAILABLE"
    ? [503, "Outcome evidence is unavailable right now."] as const
    : publicErrors[code];
  return Response.json({ error: { code, message: known[1] } }, { status: known[0] });
}

export function createCitizenOutcomeHandlers(api: CitizenOutcomeApi) {
  return {
    async record(request: Request, caseId: string) {
      const parsedId = idSchema.safeParse(caseId);
      const parsed = outcomeInput.safeParse(await request.json().catch(() => null));
      if (!parsedId.success || !parsed.success) {
        return Response.json(
          { error: { code: "INVALID_OUTCOME", message: "Check the feedback and try again." } },
          { status: 400 },
        );
      }
      const ownerHash = existingBrowserOwnerHash(request);
      if (!ownerHash) {
        return Response.json({ error: { code: "CASE_ACCESS_REQUIRED", message: "This case belongs to another browser." } }, { status: 401 });
      }
      try {
        return Response.json({ outcome: await api.record(parsedId.data, parsed.data, ownerHash) }, { status: 201 });
      } catch (error) {
        return failure(error);
      }
    },

    async list(_request: Request, caseId: string) {
      const parsedId = idSchema.safeParse(caseId);
      if (!parsedId.success) {
        return Response.json({ error: { code: "INVALID_CASE", message: "That case identifier is invalid." } }, { status: 400 });
      }
      const ownerHash = existingBrowserOwnerHash(_request);
      if (!ownerHash) {
        return Response.json({ error: { code: "CASE_ACCESS_REQUIRED", message: "This case belongs to another browser." } }, { status: 401 });
      }
      try {
        return Response.json({ outcomes: await api.list(parsedId.data, ownerHash) });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
