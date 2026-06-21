import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { Card } from "#/components/ui/card.tsx";

export function StatCard({
  label,
  value,
  icon: Icon,
  to,
}: {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  to?: string;
}) {
  const card = (
    <Card className="flex-row items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-heading text-xl leading-none font-semibold">{value}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
  return to ? (
    <Link
      to={to}
      className="block rounded-[min(var(--radius-4xl),24px)] outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      {card}
    </Link>
  ) : (
    card
  );
}
