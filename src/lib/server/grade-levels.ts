import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { gradeLevel } from "#/lib/db/schema";

import { isForeignKeyViolation, requireOrgContext } from "./context.ts";

export const listGradeLevels = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireOrgContext();
  return db
    .select()
    .from(gradeLevel)
    .where(eq(gradeLevel.organizationId, organizationId))
    .orderBy(asc(gradeLevel.sortOrder), asc(gradeLevel.name));
});

export const createGradeLevel = createServerFn({ method: "POST" })
  .validator((data: { name: string; sortOrder?: number }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    const name = data.name?.trim();
    if (!name) {
      throw new Error("Grade name is required.");
    }
    const [created] = await db
      .insert(gradeLevel)
      .values({ organizationId, name, sortOrder: data.sortOrder ?? 0 })
      .returning();
    return created;
  });

export const deleteGradeLevel = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    try {
      await db
        .delete(gradeLevel)
        .where(and(eq(gradeLevel.id, data.id), eq(gradeLevel.organizationId, organizationId)));
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        throw new Error("Can't delete this grade — it's still used by classes or curriculum.");
      }
      throw e;
    }
    return { ok: true };
  });
