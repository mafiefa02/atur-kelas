import { createFileRoute } from "@tanstack/react-router";

import { SCHOOL_DAYS } from "#/lib/schedule.ts";
import { getPublicClassTimetable } from "#/lib/server/public.ts";

export const Route = createFileRoute("/p/$token")({
  loader: ({ params }) => getPublicClassTimetable({ data: { token: params.token } }),
  component: PublicTimetable,
});

const dayLabel = (n: number) => SCHOOL_DAYS.find((d) => d.n === n)?.label ?? `Day ${n}`;
const hhmm = (t: string) => t.slice(0, 5);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col gap-6 p-6">
      <div className="font-heading text-sm font-semibold text-muted-foreground print:hidden">
        atur-kelas
      </div>
      {children}
    </div>
  );
}

function PublicTimetable() {
  const data = Route.useLoaderData();

  if (!data.found) {
    return (
      <Shell>
        <p className="text-muted-foreground">This share link isn't valid.</p>
      </Shell>
    );
  }
  if (!data.published) {
    return (
      <Shell>
        <p className="text-muted-foreground">
          This class timetable hasn't been published yet. Please check back soon.
        </p>
      </Shell>
    );
  }

  const { schoolName, className, gradeName, publishedAt, slots, cells } = data;
  const dayNums = [...new Set(slots.map((s) => s.dayOfWeek))].sort((a, b) => a - b);
  const maxSlot = slots.reduce((m, s) => Math.max(m, s.slotIndex + 1), 0);
  const rowTime = new Map<number, string>();
  for (const s of slots) {
    if (!rowTime.has(s.slotIndex)) rowTime.set(s.slotIndex, `${hhmm(s.start)}–${hhmm(s.end)}`);
  }
  const hasSlot = new Set(slots.map((s) => `${s.dayOfWeek}:${s.slotIndex}`));
  const byCell = new Map(cells.map((c) => [`${c.dayOfWeek}:${c.slotIndex}`, c]));

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">
            {gradeName} {className}
          </h1>
          <p className="text-sm text-muted-foreground">
            {schoolName} · Jadwal pelajaran
            {publishedAt ? ` · diperbarui ${new Date(publishedAt).toLocaleDateString()}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted print:hidden"
        >
          Print
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-24" />
              {dayNums.map((d) => (
                <th
                  key={d}
                  className="px-2 py-1 text-left font-medium"
                >
                  {dayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxSlot }, (_, r) => (
              <tr key={r}>
                <td className="pr-2 align-top font-mono text-xs text-muted-foreground">
                  {rowTime.get(r) ?? `Jam ${r + 1}`}
                </td>
                {dayNums.map((d) => {
                  const c = byCell.get(`${d}:${r}`);
                  const exists = hasSlot.has(`${d}:${r}`);
                  return (
                    <td
                      key={d}
                      className="align-top"
                    >
                      {c ? (
                        <div
                          className="rounded-lg px-2 py-1.5"
                          style={{ backgroundColor: `${c.subjectColor ?? "#64748b"}22` }}
                        >
                          <div className="font-medium">{c.subjectName}</div>
                          <div className="text-xs text-muted-foreground">{c.teacherName}</div>
                        </div>
                      ) : exists ? (
                        <div className="rounded-lg bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                          —
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
