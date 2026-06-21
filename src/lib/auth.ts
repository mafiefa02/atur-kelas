import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { asc, eq } from "drizzle-orm";

import { db } from "./db";
import { member } from "./db/schema/auth.ts";
import { env } from "./env";

// Better Auth trusts the baseURL origin automatically, but Vercel serves preview (and
// production) deployments from rotating *.vercel.app URLs that won't match BETTER_AUTH_URL,
// which would fail the CSRF origin check and break sign-in there. Trust each deployment's
// own origin via Vercel's injected env vars (absent locally, so this is empty in dev).
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
  .filter((host): host is string => Boolean(host))
  .map((host) => `https://${host}`);

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: vercelOrigins,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // No email provider wired in Phase 0 — don't gate local signup behind verification.
    requireEmailVerification: false,
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Every sign-in creates a fresh session whose activeOrganizationId is
          // null by default. Seed it from the user's first membership so returning
          // members land on their dashboard instead of being sent to onboarding.
          const [firstMembership] = await db
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, session.userId))
            .orderBy(asc(member.createdAt))
            .limit(1);
          return {
            data: {
              ...session,
              activeOrganizationId: firstMembership?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
  plugins: [organization(), tanstackStartCookies()],
});
