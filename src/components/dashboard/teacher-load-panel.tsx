import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import type { TeacherCoverage } from "#/lib/server/coverage.ts";
import { cn } from "#/lib/utils.ts";

function barColor(t: TeacherCoverage): string {
  if (t.overloaded) return "bg-destructive";
  if (t.capacity > 0 && t.load === t.capacity) return "bg-emerald-500";
  if (t.load === 0) return "bg-transparent";
  return "bg-primary/70";
}

export function TeacherLoadPanel({ teachers }: { teachers: TeacherCoverage[] }) {
  // Busiest first so overloaded/full teachers surface at the top.
  const sorted = [...teachers].sort((a, b) => b.load - a.load || a.name.localeCompare(b.name));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Teacher load</CardTitle>
        <span className="text-xs text-muted-foreground">
          {teachers.length} {teachers.length === 1 ? "teacher" : "teachers"}
        </span>
      </CardHeader>
      <CardContent className="px-0">
        {teachers.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">
            No teachers yet.{" "}
            <Link
              to="/teachers"
              className="text-primary hover:underline"
            >
              Add teachers
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((t) => {
              const pct = t.capacity > 0 ? Math.min(t.load / t.capacity, 1) * 100 : 0;
              return (
                <li
                  key={t.teacherId}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-5 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">{t.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-xs tabular-nums",
                      t.overloaded ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {t.load === 0 ? "no load" : `${t.load}/${t.capacity}`}
                  </span>
                  <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full", barColor(t))}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
