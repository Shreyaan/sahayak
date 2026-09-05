import { createAdminAccessHandlers } from "@/lib/admin/access-handlers";
import { adminAccessGateway } from "@/lib/admin/gateway";

const handlers = createAdminAccessHandlers(adminAccessGateway);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handlers.updateMember(request, id);
}
