// Server-only helpers for loading the active bell config, shared by the curriculum,
// assignments, and timetable server fns. Kept OUT of the client-imported server-fn modules
// so their db/postgres imports don't reach the browser ("Buffer is not defined"). Import
// this only inside server-fn handlers, never from a client component/route.

import { eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { bellSchedule } from "#/lib/db/schema/app.ts";
import { type BellConfig, DEFAULT_BELL_CONFIG, totalTeachingSlots } from "#/lib/schedule.ts";

// The active bell config for a term, falling back to the default when none is saved yet.
export async function loadBellConfig(termId: string): Promise<BellConfig> {
  const [row] = await db
    .select({ config: bellSchedule.config })
    .from(bellSchedule)
    .where(eq(bellSchedule.termId, termId))
    .limit(1);
  return row?.config ?? DEFAULT_BELL_CONFIG;
}

// Weekly teaching-slot count derived from the term's bell config.
export async function loadWeeklyTeachingSlots(termId: string): Promise<number> {
  return totalTeachingSlots(await loadBellConfig(termId));
}
