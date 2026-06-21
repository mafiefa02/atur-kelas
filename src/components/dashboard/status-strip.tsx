import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { buttonVariants } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { cn, relativeTime } from "#/lib/utils.ts";

export type TimetableStatus =
  | { status: "none" }
  | {
      status: "draft" | "published";
      generatedAt: Date | string;
      stale: boolean;
      live: number;
      total: number;
    };

const amber = "text-amber-600 dark:text-amber-500";

export function StatusStrip({
  timetable,
  readyToGenerate,
  issueCount,
}: {
  timetable: TimetableStatus;
  readyToGenerate: boolean;
  issueCount: number;
}) {
  let dot = "bg-muted-foreground/40";
  let title = "No timetable yet";
  let cta = "Generate timetable";
  let subtitle: ReactNode;

  if (timetable.status === "none") {
    subtitle = readyToGenerate ? (
      <span className="text-emerald-600 dark:text-emerald-400">Ready to generate</span>
    ) : (
      <span className={amber}>
        {issueCount} issue{issueCount === 1 ? "" : "s"} to resolve before generating
      </span>
    );
  } else if (timetable.status === "draft") {
    dot = "bg-amber-500";
    title = "Draft timetable";
    cta = "Review & publish";
    subtitle = (
      <>
        Generated {relativeTime(timetable.generatedAt)}
        {timetable.stale ? <span className={amber}> · inputs changed, regenerate</span> : null}
      </>
    );
  } else {
    dot = "bg-emerald-500";
    title = "Published";
    cta = "View timetable";
    const behind = timetable.total - timetable.live;
    subtitle = (
      <>
        Generated {relativeTime(timetable.generatedAt)}
        {timetable.stale ? <span className={amber}> · inputs changed</span> : null}
        {behind > 0 ? (
          <span className={amber}>
            {" "}
            · {timetable.live}/{timetable.total} classes live ({behind} added since publishing)
          </span>
        ) : (
          <span> · all {timetable.total} classes live</span>
        )}
      </>
    );
  }

  return (
    <Card className="flex-row items-center gap-4 px-5 py-4">
      <span
        className={cn("size-2.5 shrink-0 rounded-full", dot)}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <Link
        to="/timetable"
        className={buttonVariants({
          variant: timetable.status === "none" ? "default" : "outline",
          size: "sm",
        })}
      >
        {cta}
      </Link>
    </Card>
  );
}
