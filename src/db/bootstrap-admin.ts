import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/db/client";
import { member, organization, user } from "@/db/auth-schema";
import { REVIEW_ORG_ID, REVIEW_ORG_NAME } from "@/lib/auth/config";

const input = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12),
  name: z.string().trim().min(1),
}).parse({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
  name: process.env.ADMIN_NAME || "Sahayak Administrator",
});

const db = getDatabase();
const [existingUser] = await db.select().from(user).where(eq(user.email, input.email)).limit(1);
if (existingUser && existingUser.role !== "admin") {
  throw new Error("ADMIN_EMAIL_ALREADY_BELONGS_TO_NON_ADMIN");
}

const adminUser = existingUser ?? (await auth.api.createUser({
  body: { ...input, role: "admin", data: { emailVerified: true } },
})).user;

const [existingOrganization] = await db.select()
  .from(organization)
  .where(eq(organization.id, REVIEW_ORG_ID))
  .limit(1);

if (!existingOrganization) {
  await auth.api.createOrganization({ body: {
    name: REVIEW_ORG_NAME,
    slug: "sahayak-review-network",
    userId: adminUser.id,
  } });
}

const [ownership] = await db.select().from(member).where(and(
  eq(member.organizationId, REVIEW_ORG_ID),
  eq(member.userId, adminUser.id),
)).limit(1);

if (!ownership) {
  await auth.api.addMember({
    body: { userId: adminUser.id, organizationId: REVIEW_ORG_ID, role: "owner" },
  });
} else if (ownership.role !== "owner") {
  throw new Error("ADMIN_IS_NOT_REVIEW_ORGANIZATION_OWNER");
}

console.log(`Administrator ${adminUser.email} owns ${REVIEW_ORG_NAME}.`);
