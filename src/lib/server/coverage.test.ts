import { describe, expect, it } from "vitest";

import { summarize, type SummarizeInput } from "./coverage.ts";

const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ dayOfWeek: 0, slotIndex: i }));

describe("summarize", () => {
  it("classifies per-class coverage (ready / short / missing teacher)", () => {
    const input: SummarizeInput = {
      slots: slots(40),
      classes: [
        { id: "c1", name: "7A", gradeName: "Kelas 7", gradeLevelId: "g7" },
        { id: "c2", name: "7B", gradeName: "Kelas 7", gradeLevelId: "g7" },
        { id: "c3", name: "8A", gradeName: "Kelas 8", gradeLevelId: "g8" },
      ],
      curriculum: [
        { gradeLevelId: "g7", subjectId: "mtk", subjectName: "MTK", weeklyCount: 40 },
        { gradeLevelId: "g8", subjectId: "mtk", subjectName: "MTK", weeklyCount: 40 },
        { gradeLevelId: "g8", subjectId: "ipa", subjectName: "IPA", weeklyCount: 0 }, // not taught
      ],
      assigns: [
        { classGroupId: "c1", subjectId: "mtk", teacherId: "t1", weeklyCount: 40 }, // ready
        { classGroupId: "c2", subjectId: "mtk", teacherId: "t1", weeklyCount: 38 }, // short 2
        // c3: MTK has no teacher -> missing
      ],
      teachers: [{ id: "t1", name: "Budi" }],
    };
    const s = summarize(input);
    expect(s.slotCount).toBe(40);
    const byId = Object.fromEntries(s.classes.map((c) => [c.classId, c]));
    expect(byId.c1.status).toBe("ready");
    expect(byId.c2.status).toBe("short");
    expect(byId.c2.assigned).toBe(38);
    expect(byId.c3.status).toBe("missing");
    expect(byId.c3.missingSubjects).toEqual(["MTK"]);
  });

  it("marks an over-assigned class", () => {
    const input: SummarizeInput = {
      slots: slots(5),
      classes: [{ id: "c1", name: "7A", gradeName: "Kelas 7", gradeLevelId: "g7" }],
      curriculum: [{ gradeLevelId: "g7", subjectId: "mtk", subjectName: "MTK", weeklyCount: 5 }],
      assigns: [{ classGroupId: "c1", subjectId: "mtk", teacherId: "t1", weeklyCount: 7 }],
      teachers: [{ id: "t1", name: "Budi" }],
    };
    expect(summarize(input).classes[0].status).toBe("over");
  });

  it("flags overloaded teachers and includes idle ones", () => {
    const input: SummarizeInput = {
      slots: slots(10),
      classes: [
        { id: "c1", name: "7A", gradeName: "Kelas 7", gradeLevelId: "g7" },
        { id: "c2", name: "7B", gradeName: "Kelas 7", gradeLevelId: "g7" },
      ],
      curriculum: [],
      assigns: [
        { classGroupId: "c1", subjectId: "mtk", teacherId: "t1", weeklyCount: 8 },
        { classGroupId: "c2", subjectId: "mtk", teacherId: "t1", weeklyCount: 6 }, // t1 load 14 > 10
      ],
      teachers: [
        { id: "t1", name: "Budi" },
        { id: "t2", name: "Sari" }, // idle
      ],
    };
    const s = summarize(input);
    const t1 = s.teachers.find((t) => t.teacherId === "t1");
    const t2 = s.teachers.find((t) => t.teacherId === "t2");
    expect(t1?.load).toBe(14);
    expect(t1?.overloaded).toBe(true);
    expect(t2?.load).toBe(0);
    expect(t2?.overloaded).toBe(false);
  });
});
