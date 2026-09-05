import { createAdminAccessHandlers } from "@/lib/admin/access-handlers";
import { adminAccessGateway } from "@/lib/admin/gateway";

const handlers = createAdminAccessHandlers(adminAccessGateway);

export const POST = handlers.invite;
