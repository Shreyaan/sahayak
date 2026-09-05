import { z } from "zod";

export type AdminAccessList = {
  invitations: Array<{
    id: string;
    email: string;
    status: string;
    expiresAt?: string | Date;
  }>;
  members: Array<{
    id: string;
    role: string;
    createdAt?: string | Date;
    user: { id: string; name: string; email: string };
  }>;
};

export interface AdminAccessGateway {
  requireAdmin(headers: Headers): Promise<{ userId: string }>;
  listAccess(headers: Headers): Promise<AdminAccessList>;
  inviteExpert(input: { email: string; headers: Headers }): Promise<{ id: string; email: string; status: string }>;
  cancelInvitation(input: { invitationId: string; headers: Headers }): Promise<void>;
  setExpertAccess(input: { memberId: string; active: boolean; headers: Headers }): Promise<void>;
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
}).strict();

const accessSchema = z.object({ action: z.enum(["remove", "restore"]) }).strict();
const idSchema = z.string().trim().min(1).max(200);

const publicErrors = {
  AUTH_REQUIRED: { status: 401, message: "Please sign in." },
  ADMIN_REQUIRED: { status: 403, message: "Administrator access is required." },
  EMAIL_UNAVAILABLE: { status: 503, message: "Email delivery is not configured." },
  EMAIL_DELIVERY_FAILED: { status: 502, message: "The invitation email could not be delivered." },
  APP_URL_REQUIRED: { status: 503, message: "The public Sahayak URL is not configured." },
  MEMBER_NOT_MANAGEABLE: { status: 403, message: "Only expert access can be changed here." },
  ADMIN_OPERATION_FAILED: { status: 500, message: "The access change could not be completed." },
} as const;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function failure(error: unknown) {
  const code = error instanceof Error && error.message in publicErrors
    ? error.message as keyof typeof publicErrors
    : "ADMIN_OPERATION_FAILED";
  const known = publicErrors[code];
  return json({ error: { code, message: known.message } }, known.status);
}

async function parseJson(request: Request) {
  return request.json().catch(() => null);
}

export function createAdminAccessHandlers(gateway: AdminAccessGateway) {
  return {
    async list(request: Request) {
      try {
        await gateway.requireAdmin(request.headers);
        return json(await gateway.listAccess(request.headers));
      } catch (error) {
        return failure(error);
      }
    },

    async invite(request: Request) {
      const parsed = inviteSchema.safeParse(await parseJson(request));
      if (!parsed.success) {
        return json({ error: { code: "INVALID_REQUEST", message: "Enter a valid email address." } }, 400);
      }

      try {
        await gateway.requireAdmin(request.headers);
        const invitation = await gateway.inviteExpert({ email: parsed.data.email, headers: request.headers });
        return json({ invitation }, 201);
      } catch (error) {
        return failure(error);
      }
    },

    async cancelInvitation(request: Request, invitationId: string) {
      const parsedId = idSchema.safeParse(invitationId);
      if (!parsedId.success) {
        return json({ error: { code: "INVALID_REQUEST", message: "Invitation ID is required." } }, 400);
      }

      try {
        await gateway.requireAdmin(request.headers);
        await gateway.cancelInvitation({ invitationId: parsedId.data, headers: request.headers });
        return new Response(null, { status: 204 });
      } catch (error) {
        return failure(error);
      }
    },

    async updateMember(request: Request, memberId: string) {
      const parsed = accessSchema.safeParse(await parseJson(request));
      const parsedId = idSchema.safeParse(memberId);
      if (!parsed.success || !parsedId.success) {
        return json({ error: { code: "INVALID_REQUEST", message: "Choose remove or restore." } }, 400);
      }

      try {
        await gateway.requireAdmin(request.headers);
        await gateway.setExpertAccess({
          memberId: parsedId.data,
          active: parsed.data.action === "restore",
          headers: request.headers,
        });
        return json({ memberId: parsedId.data, status: parsed.data.action === "restore" ? "active" : "revoked" });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
