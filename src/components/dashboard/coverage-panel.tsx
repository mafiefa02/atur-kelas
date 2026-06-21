import { Link } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import type { ClassCoverage } from "#/lib/server/coverage.ts";

function StatusBadge({ c }: { c: ClassCoverage }) {
  switch (c.status) {
    case "ready":
      return (
        <Badge className="border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          ready
        </Badge>
      );
    case "short":
      return (
        <Badge className="border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-500">
          {c.required - c.assigned} short
        </Badge>
      );
    case "over":
      return <Badge variant="destructive">{c.assigned - c.required} over</Badge>;
    case "missing":
      return (
        <Badge
          variant="destructive"
          title={`No teacher for ${c.missingSubjects.join(", ")}`}
        >
          missing teacher
        </Badge>
      );
  }
}

export function CoveragePanel({ classes }: { classes: ClassCoverage[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Per-class coverage</CardTitle>
        <span className="text-xs text-muted-foreground">
          {classes.length} {classes.length === 1 ? "class" : "classes"}
        </span>
      </CardHeader>
      <CardContent className="px-0">
        {classes.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">
            No classes yet.{" "}
            <Link
              to="/classes"
              className="text-primary hover:underline"
            >
              Add classes
            </Link>{" "}
            to see coverage.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {classes.map((c) => (
              <li
                key={c.classId}
                className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {c.gradeName} {c.className}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-muted-foreground tabular-nums">
                    {c.assigned}/{c.required}
                  </span>
                  <StatusBadge c={c} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
