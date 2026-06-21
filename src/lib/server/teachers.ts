import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { teacher } from "#/lib/db/schema/app.ts";

import { isForeignKeyViolation, requireOrgContext } from "./context.ts";

export const listTeachers = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireOrgContext();
  return db
    .select()
    .from(teacher)
    .where(eq(teacher.organizationId, organizationId))
    .orderBy(asc(teacher.name));
});

export const createTeacher = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    const name = data.name?.trim();
    if (!name) {
      throw new Error("Teacher name is required.");
    }
    const [created] = await db.insert(teacher).values({ organizationId, name }).returning();
    return created;
  });

export const deleteTeacher = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    try {
      await db
        .delete(teacher)
        .where(and(eq(teacher.id, data.id), eq(teacher.organizationId, organizationId)));
    } catch (e) {
      if (isForeignKeyViolation(e)) {
        throw new Error("Can't delete this teacher — they're still assigned to a class.");
      }
      throw e;
    }
    return { ok: true };
  });
