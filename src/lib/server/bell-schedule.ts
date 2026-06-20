import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { bellSchedule } from "#/lib/db/schema";
import {
  type BellConfig,
  type DayConfig,
  DEFAULT_BELL_CONFIG,
  SCHOOL_DAYS,
  toMinutes,
} from "#/lib/schedule.ts";

import { requireActiveTerm } from "./context.ts";

// One bell schedule per term (unique index on term_id). Create lazily on first access.
async function getOrCreateSchedule(termId: string, organizationId: string) {
  const [existing] = await db
    .select()
    .from(bellSchedule)
    .where(eq(bellSchedule.termId, termId))
    .limit(1);
  if (existing) return existing;
  try {
    const [created] = await db
      .insert(bellSchedule)
      .values({ termId, organizationId, config: DEFAULT_BELL_CONFIG })
      .returning();
    return created;
  } catch {
    const [again] = await db
      .select()
      .from(bellSchedule)
      .where(eq(bellSchedule.termId, termId))
      .limit(1);
    if (again) return again;
    throw new Error("Could not load the bell schedule.");
  }
}

const isHHMM = (s: unknown): s is string => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

function validateConfig(input: BellConfig): BellConfig {
  const periodMinutes = Math.round(Number(input?.periodMinutes));
  if (!Number.isFinite(periodMinutes) || periodMinutes < 5 || periodMinutes > 240) {
    throw new Error("Period length must be between 5 and 240 minutes.");
  }
  const days: Record<string, DayConfig> = {};
  for (const { n, label } of SCHOOL_DAYS) {
    const d = input?.days?.[String(n)];
    if (!d) {
      days[String(n)] = { schoolDay: false, start: "07:00", end: "15:00", breaks: [] };
      continue;
    }
    if (!isHHMM(d.start) || !isHHMM(d.end)) {
      throw new Error(`Invalid start/end time for ${label}.`);
    }
    if (d.schoolDay && toMinutes(d.end) <= toMinutes(d.start)) {
      throw new Error(`${label}: end time must be after start time.`);
    }
    const breaks = (Array.isArray(d.breaks) ? d.breaks : [])
      .filter((b) => isHHMM(b.start) && isHHMM(b.end))
      .map((b) => ({
        start: b.start,
        end: b.end,
        label:
          typeof b.label === "string" && b.label.trim() ? b.label.trim().slice(0, 40) : undefined,
      }));
    days[String(n)] = { schoolDay: Boolean(d.schoolDay), start: d.start, end: d.end, breaks };
  }
  return { periodMinutes, days };
}

export const getBellSchedule = createServerFn({ method: "GET" }).handler(async () => {
  const { term, organizationId } = await requireActiveTerm();
  const schedule = await getOrCreateSchedule(term.id, organizationId);
  return { termName: term.name, config: schedule.config };
});

export const saveBellSchedule = createServerFn({ method: "POST" })
  .validator((data: { config: BellConfig }) => data)
  .handler(async ({ data }) => {
    const { term, organizationId } = await requireActiveTerm();
    const config = validateConfig(data.config);
    await getOrCreateSchedule(term.id, organizationId);
    await db.update(bellSchedule).set({ config }).where(eq(bellSchedule.termId, term.id));
    return { ok: true };
  });
