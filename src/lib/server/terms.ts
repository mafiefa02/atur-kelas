import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { term } from "#/lib/db/schema";

import { requireOrgContext } from "./context.ts";

export const listTerms = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireOrgContext();
  return db
    .select()
    .from(term)
    .where(eq(term.organizationId, organizationId))
    .orderBy(desc(term.isActive), desc(term.createdAt));
});

export const createTerm = createServerFn({ method: "POST" })
  .validator((data: { name: string; startDate?: string; endDate?: string }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    const name = data.name?.trim();
    if (!name) {
      throw new Error("Term name is required.");
    }
    const [created] = await db
      .insert(term)
      .values({
        organizationId,
        name,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
      })
      .returning();
    return created;
  });

export const setActiveTerm = createServerFn({ method: "POST" })
  .validator((data: { termId: string }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    await db.transaction(async (tx) => {
      // IDOR guard: the term must belong to the caller's org.
      const [target] = await tx
        .select({ id: term.id })
        .from(term)
        .where(and(eq(term.id, data.termId), eq(term.organizationId, organizationId)))
        .limit(1);
      if (!target) {
        throw new Error("Term not found.");
      }
      // Unset the current active term, then set the new one (partial unique index
      // guarantees at most one active per org).
      await tx
        .update(term)
        .set({ isActive: false })
        .where(and(eq(term.organizationId, organizationId), eq(term.isActive, true)));
      await tx.update(term).set({ isActive: true }).where(eq(term.id, data.termId));
    });
    return { ok: true };
  });

export const deleteTerm = createServerFn({ method: "POST" })
  .validator((data: { termId: string }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    // Scoped delete — id alone is never trusted.
    await db
      .delete(term)
      .where(and(eq(term.id, data.termId), eq(term.organizationId, organizationId)));
    return { ok: true };
  });
