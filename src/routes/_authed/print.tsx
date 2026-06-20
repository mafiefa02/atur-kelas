import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "#/components/ui/button.tsx";
import { SCHOOL_DAYS } from "#/lib/schedule.ts";
import { getTimetableView } from "#/lib/server/timetable.ts";
import { cn } from "#/lib/utils.ts";

export const Route = createFileRoute("/_authed/print")({
  loader: () => getTimetableView(),
  component: PrintPage,
});

const dayLabel = (n: number) => SCHOOL_DAYS.find((d) => d.n === n)?.label ?? `Day ${n}`;
const hhmm = (t: string) => t.slice(0, 5);

type View = Awaited<ReturnType<typeof getTimetableView>>;

function PrintPage() {
  const { termName, classes, slots, placements, timetable } = Route.useLoaderData();

  const dayNums = [...new Set(slots.map((s) => s.dayOfWeek))].sort((a, b) => a - b);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          to="/timetable"
          className="text-sm text-primary hover:underline"
        >
          ← Back to timetable
        </Link>
        <Button
          size="sm"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </Button>
      </div>

      {!timetable || placements.length === 0 ? (
        <p className="text-sm text-muted-foreground print:hidden">
          No timetable to print yet — generate one first.
        </p>
      ) : (
        classes.map((c, i) => (
          <section
            key={c.id}
            className={cn("break-inside-avoid", i > 0 && "break-before-page", i > 0 && "pt-8")}
          >
            <h2 className="font-heading text-lg font-semibold">
              {c.gradeName} {c.name}
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">{termName}</p>
            <ClassGrid
              slots={slots}
              dayNums={dayNums}
              cells={placements}
              classId={c.id}
            />
          </section>
        ))
      )}
    </div>
  );
}

function ClassGrid({
  slots,
  dayNums,
  cells,
  classId,
}: {
  slots: View["slots"];
  dayNums: number[];
  cells: View["placements"];
  classId: string;
}) {
  const maxSlot = slots.reduce((m, s) => Math.max(m, s.slotIndex + 1), 0);
  const rowTime = new Map<number, string>();
  for (const s of slots) {
    if (!rowTime.has(s.slotIndex)) rowTime.set(s.slotIndex, `${hhmm(s.start)}–${hhmm(s.end)}`);
  }
  const hasSlot = new Set(slots.map((s) => `${s.dayOfWeek}:${s.slotIndex}`));
  const byCell = new Map(
    cells
      .filter((c) => c.classGroupId === classId)
      .map((c) => [`${c.dayOfWeek}:${c.slotIndex}`, c]),
  );

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          <th className="border border-border px-2 py-1 text-left">Jam</th>
          {dayNums.map((d) => (
            <th
              key={d}
              className="border border-border px-2 py-1 text-left"
            >
              {dayLabel(d)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: maxSlot }, (_, r) => (
          <tr key={r}>
            <td className="border border-border px-2 py-1 font-mono text-muted-foreground">
              {rowTime.get(r) ?? `${r + 1}`}
            </td>
            {dayNums.map((d) => {
              const c = byCell.get(`${d}:${r}`);
              const exists = hasSlot.has(`${d}:${r}`);
              return (
                <td
                  key={d}
                  className="border border-border px-2 py-1 align-top"
                >
                  {c ? (
                    <>
                      <div className="font-medium">{c.subjectName}</div>
                      <div className="text-muted-foreground">{c.teacherName}</div>
                    </>
                  ) : exists ? (
                    <span className="text-muted-foreground">—</span>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
