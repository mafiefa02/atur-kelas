import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { subject } from "#/lib/db/schema/app.ts";

import { isForeignKeyViolation, requireOrgContext } from "./context.ts";

export const listSubjects = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireOrgContext();
  return db
    .select()
    .from(subject)
    .where(eq(subject.organizationId, organizationId))
    .orderBy(asc(subject.name));
});

export const createSubject = createServerFn({ method: "POST" })
  .validator((data: { name: string; code?: string; color?: string }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    const name = data.name?.trim();
    if (!name) {
      throw new Error("Subject name is required.");
    }
    const [created] = await db
      .insert(subject)
      .values({
        organizationId,
        name,
        code: data.code?.trim() || null,
        color: data.color?.trim() || null,
      })
      .returning();
    return created;
  });

export const deleteSubject = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    try {
      await db
        .delete(subject)
        .where(and(eq(subject.id, data.id), eq(subject.organizationId, organizationId)));
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        throw new Error(
          "Can't delete this subject — it's still used by curriculum or assignments.",
        );
      }
      throw e;
    }
    return { ok: true };
  });
