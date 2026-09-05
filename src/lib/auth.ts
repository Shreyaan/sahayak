import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { adminAc, defaultAc, memberAc, ownerAc } from "better-auth/plugins/organization/access";
import * as authSchema from "@/db/auth-schema";
import { getDatabase } from "@/db/client";
import { REVIEW_ORG_ID } from "@/lib/auth/config";
import { authEmail } from "@/lib/auth/email-instance";

const revokedAc = defaultAc.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
});

export const auth = betterAuth({
  appName: "Sahayak",
  database: drizzleAdapter(getDatabase(), {
    provider: "pg",
    schema: authSchema,
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    // The invite UI calls the foreground resend endpoint after signup so a
    // provider failure can be shown truthfully instead of being swallowed by
    // Better Auth's background signup hook.
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      const result = await authEmail.sendVerification({ email: user.email, verificationUrl: url });
      if (!result.delivered) throw new Error(result.reason);
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    organization({
      roles: {
        owner: ownerAc,
        admin: adminAc,
        member: memberAc,
        revoked: revokedAc,
      },
      allowUserToCreateOrganization: false,
      requireEmailVerificationOnInvitation: true,
      organizationHooks: {
        async beforeCreateOrganization({ organization }) {
          return { data: { ...organization, id: REVIEW_ORG_ID } };
        },
      },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
