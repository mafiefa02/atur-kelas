import { describe, expect, it } from "vitest";

import { type ExportData, timetableToCsv } from "./export.ts";

const data: ExportData = {
  slots: [
    { dayOfWeek: 1, slotIndex: 0, start: "07:00:00", end: "07:45:00" },
    { dayOfWeek: 2, slotIndex: 0, start: "07:00:00", end: "07:45:00" },
  ],
  classes: [{ id: "c1", name: "7A", gradeName: "Kelas 7" }],
  placements: [
    { classGroupId: "c1", dayOfWeek: 2, slotIndex: 0, subjectName: "IPA", teacherName: "Bu Siti" },
    {
      classGroupId: "c1",
      dayOfWeek: 1,
      slotIndex: 0,
      subjectName: "Matematika",
      teacherName: "Pak Budi",
    },
  ],
};

describe("timetableToCsv", () => {
  it("emits a header and sorts by class, day, slot with mapped day/time labels", () => {
    const csv = timetableToCsv(data);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Class,Day,Time,Subject,Teacher");
    expect(lines[1]).toBe("Kelas 7 7A,Senin,07:00-07:45,Matematika,Pak Budi");
    expect(lines[2]).toBe("Kelas 7 7A,Selasa,07:00-07:45,IPA,Bu Siti");
  });

  it("quotes cells containing commas", () => {
    const csv = timetableToCsv({
      ...data,
      placements: [
        {
          classGroupId: "c1",
          dayOfWeek: 1,
          slotIndex: 0,
          subjectName: "Seni, Budaya",
          teacherName: "X",
        },
      ],
    });
    expect(csv).toContain('"Seni, Budaya"');
  });
});
