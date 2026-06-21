import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { cn } from "#/lib/utils.ts";

export type GradeCurriculum = {
  gradeLevelId: string;
  gradeName: string;
  entries: { subjectName: string; weeklyCount: number }[];
  total: number;
};

export function CurriculumPanel({
  curriculumByGrade,
  slotCount,
}: {
  curriculumByGrade: GradeCurriculum[];
  slotCount: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Curriculum by grade</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {curriculumByGrade.length === 0 ? (
          <p className="px-5 text-sm text-muted-foreground">
            No curriculum set.{" "}
            <Link
              to="/curriculum"
              className="text-primary hover:underline"
            >
              Set weekly hours
            </Link>{" "}
            per grade.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {curriculumByGrade.map((g) => {
              const matches = slotCount > 0 && g.total === slotCount;
              return (
                <li
                  key={g.gradeLevelId}
                  className="px-5 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{g.gradeName}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        matches ? "text-muted-foreground" : "text-amber-600 dark:text-amber-500",
                      )}
                    >
                      total {g.total}
                      {slotCount > 0 && !matches ? ` / ${slotCount} slots` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {g.entries.map((e) => `${e.subjectName} ${e.weeklyCount}`).join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
