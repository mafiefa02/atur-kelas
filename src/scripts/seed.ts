// Dev seed: one fully-configured, feasible school so you can exercise the whole flow
// (log in → review setup → generate a timetable → tweak/pin → publish).
//
// Run with `make seed` (or `pnpm db:seed`). Idempotent: it wipes its own org/user first.

import { eq } from "drizzle-orm";

import { auth } from "../lib/auth.ts";
import { db } from "../lib/db/index.ts";
import {
  assignment,
  bellSchedule,
  classGroup,
  gradeLevel,
  member,
  organization,
  subject,
  subjectHours,
  teacher,
  term,
  user,
} from "../lib/db/schema/index.ts";
import { type BellConfig, totalTeachingSlots } from "../lib/schedule.ts";

const EMAIL = "admin@sekolah.test";
const PASSWORD = "password123";
const ORG_NAME = "SMP Harapan Bangsa";
const ORG_SLUG = "smp-harapan";

async function main() {
  // 1. Wipe any prior seed (cascades: org → term/classes/curriculum/assignments/schedule,
  //    user → sessions/accounts/members).
  await db.delete(organization).where(eq(organization.slug, ORG_SLUG));
  await db.delete(user).where(eq(user.email, EMAIL));

  // 2. Admin user (Better Auth hashes the password).
  await auth.api.signUpEmail({ body: { name: "Admin Sekolah", email: EMAIL, password: PASSWORD } });
  const [u] = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);
  if (!u) throw new Error("Failed to create the seed user.");

  // 3. Organization + owner membership.
  const orgId = crypto.randomUUID();
  await db
    .insert(organization)
    .values({ id: orgId, name: ORG_NAME, slug: ORG_SLUG, createdAt: new Date() });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId: u.id,
    role: "owner",
    createdAt: new Date(),
  });

  // 4. Active term.
  const [activeTerm] = await db
    .insert(term)
    .values({
      organizationId: orgId,
      name: "2026/2027 Ganjil",
      startDate: "2026-07-13",
      endDate: "2026-12-18",
      isActive: true,
    })
    .returning();

  // 5. Bell schedule: Senin–Jumat 07:00–12:15 with a 15-min break → 6 teaching slots/day.
  const dayOn = {
    schoolDay: true,
    start: "07:00",
    end: "12:15",
    breaks: [{ start: "09:15", end: "09:30", label: "Istirahat" }],
  };
  const dayOff = { schoolDay: false, start: "07:00", end: "12:15", breaks: [] };
  const config: BellConfig = {
    periodMinutes: 45,
    days: { "1": dayOn, "2": dayOn, "3": dayOn, "4": dayOn, "5": dayOn, "6": dayOff },
  };
  await db.insert(bellSchedule).values({ organizationId: orgId, termId: activeTerm.id, config });
  const T = totalTeachingSlots(config);

  // 6. Subjects with a dedicated teacher and weekly count (must sum to T).
  const defs = [
    { name: "Matematika", code: "MAT", color: "#3b82f6", weekly: 4, teacher: "Pak Budi" },
    { name: "Bahasa Indonesia", code: "BIN", color: "#ef4444", weekly: 4, teacher: "Bu Sari" },
    { name: "Bahasa Inggris", code: "BIG", color: "#f59e0b", weekly: 4, teacher: "Bu Rina" },
    { name: "IPA", code: "IPA", color: "#10b981", weekly: 3, teacher: "Bu Dewi" },
    { name: "IPS", code: "IPS", color: "#8b5cf6", weekly: 3, teacher: "Pak Anton" },
    { name: "PJOK", code: "PJK", color: "#ec4899", weekly: 4, teacher: "Pak Eko" },
    { name: "PAI", code: "PAI", color: "#14b8a6", weekly: 3, teacher: "Ustadz Ali" },
    { name: "Pendidikan Pancasila", code: "PPC", color: "#6366f1", weekly: 3, teacher: "Bu Wati" },
    { name: "Informatika", code: "INF", color: "#06b6d4", weekly: 2, teacher: "Pak Rian" },
  ];
  const weeklySum = defs.reduce((s, d) => s + d.weekly, 0);
  if (weeklySum !== T) {
    throw new Error(
      `Curriculum sums to ${weeklySum} but the bell schedule has ${T} slots/week — adjust the seed.`,
    );
  }

  const grades = await db
    .insert(gradeLevel)
    .values([
      { organizationId: orgId, name: "Kelas 7", sortOrder: 1 },
      { organizationId: orgId, name: "Kelas 8", sortOrder: 2 },
      { organizationId: orgId, name: "Kelas 9", sortOrder: 3 },
    ])
    .returning();

  const subjects = await db
    .insert(subject)
    .values(
      defs.map((d) => ({ organizationId: orgId, name: d.name, code: d.code, color: d.color })),
    )
    .returning();
  const teachers = await db
    .insert(teacher)
    .values(
      [...new Set(defs.map((d) => d.teacher))].map((name) => ({ organizationId: orgId, name })),
    )
    .returning();
  const subjectByName = new Map(subjects.map((s) => [s.name, s]));
  const teacherByName = new Map(teachers.map((t) => [t.name, t]));
  const plan = defs.map((d) => ({
    subjectId: subjectByName.get(d.name)!.id,
    teacherId: teacherByName.get(d.teacher)!.id,
    weekly: d.weekly,
  }));

  // 7. Two classes per grade.
  const classes = await db
    .insert(classGroup)
    .values(
      grades.flatMap((g) => {
        const n = g.name.replace("Kelas ", "");
        return [
          { organizationId: orgId, termId: activeTerm.id, gradeLevelId: g.id, name: `${n}A` },
          { organizationId: orgId, termId: activeTerm.id, gradeLevelId: g.id, name: `${n}B` },
        ];
      }),
    )
    .returning();

  // 8. Curriculum (subject hours) per grade.
  await db.insert(subjectHours).values(
    grades.flatMap((g) =>
      plan.map((p) => ({
        organizationId: orgId,
        termId: activeTerm.id,
        gradeLevelId: g.id,
        subjectId: p.subjectId,
        weeklyCount: p.weekly,
      })),
    ),
  );

  // 9. Assignments per class (teacher per subject), weekly counts inherited.
  await db.insert(assignment).values(
    classes.flatMap((c) =>
      plan.map((p) => ({
        organizationId: orgId,
        termId: activeTerm.id,
        classGroupId: c.id,
        subjectId: p.subjectId,
        teacherId: p.teacherId,
        weeklyCount: p.weekly,
      })),
    ),
  );

  console.log(
    `Seeded ${ORG_NAME}: ${grades.length} grades, ${classes.length} classes, ` +
      `${subjects.length} subjects, ${teachers.length} teachers, ${T} teaching slots/week.`,
  );
  console.log(`Everything is feasible — log in and click Generate on the Timetable page.`);
  console.log(`\n  Login:  ${EMAIL}\n  Pass:   ${PASSWORD}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
