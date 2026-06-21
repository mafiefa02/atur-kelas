import { redirect } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";

import { auth } from "#/lib/auth.ts";
import { db } from "#/lib/db";
import { term } from "#/lib/db/schema/app.ts";

// Re-derives the tenant scope from the session on the SERVER. Never accept an
// organizationId/termId from the client for scoping — always go through these so
// the safe (non-IDOR) path is the default. Throws a redirect when the
// precondition isn't met, so these compose cleanly in loaders and server fns.

export async function requireOrgContext() {
  const { headers } = getRequest();
  const data = await auth.api.getSession({ headers });
  if (!data?.user) {
    throw redirect({ to: "/login" });
  }
  const organizationId = data.session.activeOrganizationId;
  if (!organizationId) {
    throw redirect({ to: "/onboarding" });
  }
  return { user: data.user, session: data.session, organizationId };
}

// Postgres foreign-key violation — raised when deleting a catalog row that's still
// referenced (we use ON DELETE RESTRICT for grade/subject/teacher references).
export function isForeignKeyViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23503";
}

export async function requireActiveTerm() {
  const ctx = await requireOrgContext();
  const [active] = await db
    .select()
    .from(term)
    .where(and(eq(term.organizationId, ctx.organizationId), eq(term.isActive, true)))
    .limit(1);
  // No active term is the same shape as "no active org" — send the user to set one up.
  if (!active) {
    throw redirect({ to: "/terms" });
  }
  return { ...ctx, term: active };
}
