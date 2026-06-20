import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { classGroup, gradeLevel } from "#/lib/db/schema";

import { requireActiveTerm } from "./context.ts";

export const listClasses = createServerFn({ method: "GET" }).handler(async () => {
  const { term, organizationId } = await requireActiveTerm();
  return db
    .select({
      id: classGroup.id,
      name: classGroup.name,
      gradeLevelId: classGroup.gradeLevelId,
      gradeName: gradeLevel.name,
      gradeSort: gradeLevel.sortOrder,
    })
    .from(classGroup)
    .innerJoin(gradeLevel, eq(gradeLevel.id, classGroup.gradeLevelId))
    .where(and(eq(classGroup.organizationId, organizationId), eq(classGroup.termId, term.id)))
    .orderBy(asc(gradeLevel.sortOrder), asc(classGroup.name));
});

export const createClass = createServerFn({ method: "POST" })
  .validator((data: { gradeLevelId: string; name: string }) => data)
  .handler(async ({ data }) => {
    const { term, organizationId } = await requireActiveTerm();
    const name = data.name?.trim();
    if (!name) {
      throw new Error("Class name is required.");
    }
    // IDOR: the grade must belong to this org.
    const [grade] = await db
      .select({ id: gradeLevel.id })
      .from(gradeLevel)
      .where(
        and(eq(gradeLevel.id, data.gradeLevelId), eq(gradeLevel.organizationId, organizationId)),
      )
      .limit(1);
    if (!grade) {
      throw new Error("Grade level not found.");
    }
    const [created] = await db
      .insert(classGroup)
      .values({ organizationId, termId: term.id, gradeLevelId: data.gradeLevelId, name })
      .returning();
    return created;
  });

export const deleteClass = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { term, organizationId } = await requireActiveTerm();
    // Assignments cascade with the class, so no FK-restrict to handle here.
    await db
      .delete(classGroup)
      .where(
        and(
          eq(classGroup.id, data.id),
          eq(classGroup.organizationId, organizationId),
          eq(classGroup.termId, term.id),
        ),
      );
    return { ok: true };
  });
