import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { classGroup, gradeLevel } from "#/lib/db/schema";

import { requireActiveTerm } from "./context.ts";

export const getShareLinks = createServerFn({ method: "GET" }).handler(async () => {
  const { term, organizationId } = await requireActiveTerm();
  return db
    .select({
      id: classGroup.id,
      name: classGroup.name,
      gradeName: gradeLevel.name,
      token: classGroup.shareToken,
    })
    .from(classGroup)
    .innerJoin(gradeLevel, eq(gradeLevel.id, classGroup.gradeLevelId))
    .where(and(eq(classGroup.organizationId, organizationId), eq(classGroup.termId, term.id)))
    .orderBy(asc(gradeLevel.sortOrder), asc(classGroup.name));
});
