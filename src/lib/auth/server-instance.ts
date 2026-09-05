import { auth } from "@/lib/auth";
import { createServerAccess } from "./server";

export const serverAccess = createServerAccess({
  getSession: ({ headers }) => auth.api.getSession({ headers }),
  async getFullOrganization({ headers, query }) {
    const organization = await auth.api.getFullOrganization({ headers, query });
    return organization
      ? {
          members: organization.members.map(({ id, userId, role }) => ({ id, userId, role })),
        }
      : null;
  },
});
