import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "#/components/ui/button.tsx";
import { buildGridFrame, dayLabel } from "#/lib/schedule.ts";
import { getTimetableView } from "#/lib/server/timetable.ts";
import { cn } from "#/lib/utils.ts";

export const Route = createFileRoute("/_authed/print")({
  loader: () => getTimetableView(),
  component: PrintPage,
});

type View = Awaited<ReturnType<typeof getTimetableView>>;

function PrintPage() {
  const { termName, classes, slots, placements, timetable } = Route.useLoaderData();

  const { dayNums, maxSlot, rowTime, hasSlot } = buildGridFrame(slots);
  // Group placements by class once instead of re-scanning every placement per class grid.
  const cellsByClass = new Map<string, Map<string, View["placements"][number]>>();
  for (const p of placements) {
    let m = cellsByClass.get(p.classGroupId);
    if (!m) cellsByClass.set(p.classGroupId, (m = new Map()));
    m.set(`${p.dayOfWeek}:${p.slotIndex}`, p);
  }

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
              dayNums={dayNums}
              maxSlot={maxSlot}
              rowTime={rowTime}
              hasSlot={hasSlot}
              byCell={cellsByClass.get(c.id) ?? new Map()}
            />
          </section>
        ))
      )}
    </div>
  );
}

function ClassGrid({
  dayNums,
  maxSlot,
  rowTime,
  hasSlot,
  byCell,
}: {
  dayNums: number[];
  maxSlot: number;
  rowTime: Map<number, string>;
  hasSlot: Set<string>;
  byCell: Map<string, View["placements"][number]>;
}) {
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
