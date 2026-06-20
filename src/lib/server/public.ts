import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { classGroup, timetable } from "#/lib/db/schema";

// PUBLIC (no auth): the share token is the capability. Reads the denormalized snapshot
// for one class only — no org/other-class data, no joins. Keep all db use inside the
// handler so the client stub stays free of db/postgres (avoids the Buffer leak).
export const getPublicClassTimetable = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const token = data.token?.trim();
    if (!token) {
      return { found: false as const };
    }
    const [cls] = await db
      .select({ id: classGroup.id, termId: classGroup.termId })
      .from(classGroup)
      .where(eq(classGroup.shareToken, token))
      .limit(1);
    if (!cls) {
      return { found: false as const };
    }
    const [tt] = await db
      .select({ snapshot: timetable.publishedSnapshot })
      .from(timetable)
      .where(eq(timetable.termId, cls.termId))
      .limit(1);
    const snap = tt?.snapshot;
    const classData = snap?.classes[cls.id];
    if (!snap || !classData) {
      return { found: true as const, published: false as const };
    }
    return {
      found: true as const,
      published: true as const,
      schoolName: snap.schoolName,
      termName: snap.termName,
      publishedAt: snap.publishedAt,
      className: classData.name,
      gradeName: classData.gradeName,
      slots: snap.slots,
      cells: classData.cells,
    };
  });
