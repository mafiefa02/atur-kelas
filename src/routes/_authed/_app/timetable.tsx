import { CaretDownIcon, DownloadSimpleIcon, PrinterIcon, PushPinIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { AgendaTimetable } from "#/components/agenda-timetable.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuTrigger } from "#/components/ui/menu.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { timetableToCsv } from "#/lib/export.ts";
import { buildGridFrame, dayLabel } from "#/lib/schedule.ts";
import {
  generateTimetable,
  getTimetableView,
  publishTimetable,
  swapPlacements,
  togglePin,
} from "#/lib/server/timetable.ts";
import { cn } from "#/lib/utils.ts";

export const Route = createFileRoute("/_authed/_app/timetable")({
  loader: () => getTimetableView(),
  component: TimetablePage,
});

function TimetablePage() {
  const { termName, readiness, slots, classes, timetable, placements } = Route.useLoaderData();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(classes[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ day: number; slot: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<"agenda" | "grid">("agenda");

  async function generate(newSeed: boolean) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await generateTimetable({ data: { newSeed } });
      if (!r.ok) {
        setError(r.blockers.join(" "));
        return;
      }
      setSelectedCell(null);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await publishTimetable();
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    const csv = timetableToCsv({ slots, classes, placements });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jadwal-${termName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onCellClick(day: number, slot: number, isPinned: boolean) {
    if (isPinned) {
      setMessage("That lesson is pinned — unpin it to move it.");
      return;
    }
    setMessage(null);
    if (!selectedCell) {
      setSelectedCell({ day, slot });
      return;
    }
    if (selectedCell.day === day && selectedCell.slot === slot) {
      setSelectedCell(null);
      return;
    }
    setBusy(true);
    try {
      const r = await swapPlacements({
        data: {
          classGroupId: selectedId,
          a: { dayOfWeek: selectedCell.day, slotIndex: selectedCell.slot },
          b: { dayOfWeek: day, slotIndex: slot },
        },
      });
      setSelectedCell(null);
      if (!r.ok) {
        setError(r.error ?? "Swap failed.");
      } else {
        setMessage(r.warning ?? null);
        await router.invalidate();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePin(day: number, slot: number) {
    setBusy(true);
    try {
      await togglePin({ data: { classGroupId: selectedId, dayOfWeek: day, slotIndex: slot } });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  const { dayNums, maxSlot, rowTime, hasSlot } = buildGridFrame(slots);
  const cell = new Map<string, (typeof placements)[number]>();
  for (const p of placements) {
    if (p.classGroupId === selectedId) cell.set(`${p.dayOfWeek}:${p.slotIndex}`, p);
  }
  const agendaCells = placements.filter((p) => p.classGroupId === selectedId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading text-xl font-semibold">Timetable</h1>
            {timetable ? (
              <Badge variant={timetable.status === "published" ? "default" : "secondary"}>
                {timetable.status === "published" ? "Published" : "Draft"}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Generate the weekly schedule for <span className="font-medium">{termName}</span>.
          </p>
        </div>
        {timetable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Menu>
              <MenuTrigger
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
              >
                Export
                <CaretDownIcon className="size-3.5 opacity-60" />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuLinkItem render={<Link to="/print" />}>
                  <PrinterIcon className="size-4" />
                  Print
                </MenuLinkItem>
                <MenuItem onClick={downloadCsv}>
                  <DownloadSimpleIcon className="size-4" />
                  Download CSV
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generate(false)}
              disabled={busy || !readiness.ok}
            >
              Regenerate
            </Button>
            {timetable.status === "draft" ? (
              <Button
                size="sm"
                onClick={publish}
                disabled={busy || timetable.stale}
              >
                Publish
              </Button>
            ) : null}
          </div>
        ) : (
          <Button
            onClick={() => generate(false)}
            disabled={busy || !readiness.ok || classes.length === 0}
          >
            {busy ? "Generating…" : "Generate timetable"}
          </Button>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-amber-600 dark:text-amber-500">{message}</p> : null}

      {!readiness.ok ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fix these before generating</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm">
              {readiness.blockers.map((b, i) => (
                <li
                  key={i}
                  className="flex gap-2"
                >
                  <span className="text-destructive">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Edit{" "}
              <Link
                to="/curriculum"
                className="text-primary hover:underline"
              >
                curriculum
              </Link>
              ,{" "}
              <Link
                to="/assignments"
                className="text-primary hover:underline"
              >
                assignments
              </Link>
              , or the{" "}
              <Link
                to="/schedule"
                className="text-primary hover:underline"
              >
                bell schedule
              </Link>{" "}
              to resolve.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {timetable?.stale ? (
        <Card className="ring-1 ring-destructive/30">
          <CardContent className="py-4 text-sm">
            <span className="font-medium text-destructive">
              Inputs changed since this was generated.
            </span>{" "}
            <span className="text-muted-foreground">
              The grid below may be out of date — regenerate to refresh it.
            </span>
          </CardContent>
        </Card>
      ) : null}

      {timetable && classes.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Weekly schedule</CardTitle>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-border p-0.5">
                  {(["agenda", "grid"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setView(v);
                        setSelectedCell(null);
                      }}
                      className={cn(
                        "rounded-md px-3 py-1 text-sm capitalize transition-colors",
                        view === v
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <Select
                  value={selectedId}
                  onValueChange={(v) => {
                    setSelectedId(v as string);
                    setSelectedCell(null);
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue>
                      {(v: string | null) => {
                        const c = classes.find((x) => x.id === v);
                        return c ? `${c.gradeName} · ${c.name}` : "Pick a class";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                      >
                        {c.gradeName} · {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 overflow-x-auto">
            {view === "agenda" ? (
              <AgendaTimetable
                slots={slots}
                cells={agendaCells}
              />
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Click a lesson, then another in this class to swap them. Use the pin to lock a
                  lesson so regenerate keeps it.
                </p>
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
                          const p = cell.get(`${d}:${r}`);
                          const exists = hasSlot.has(`${d}:${r}`);
                          const isSel = selectedCell?.day === d && selectedCell?.slot === r;
                          return (
                            <td
                              key={d}
                              className="h-px align-top"
                            >
                              {p ? (
                                <div
                                  onClick={() => onCellClick(d, r, p.isPinned)}
                                  className={cn(
                                    "group relative flex h-full cursor-pointer flex-col rounded-lg px-2 py-1.5 ring-1 ring-transparent transition-shadow",
                                    isSel && "ring-2 ring-ring",
                                    busy && "pointer-events-none opacity-70",
                                  )}
                                  style={{ backgroundColor: `${p.subjectColor ?? "#64748b"}22` }}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <span className="font-medium">{p.subjectName}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onTogglePin(d, r);
                                      }}
                                      className={cn(
                                        "shrink-0 rounded p-0.5 transition-opacity",
                                        p.isPinned
                                          ? "text-primary"
                                          : "text-muted-foreground opacity-0 group-hover:opacity-100",
                                      )}
                                      title={p.isPinned ? "Unpin" : "Pin"}
                                    >
                                      <PushPinIcon
                                        weight={p.isPinned ? "fill" : "regular"}
                                        className="size-3.5"
                                      />
                                    </button>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {p.teacherName}
                                  </div>
                                </div>
                              ) : exists ? (
                                <div className="flex h-full items-center rounded-lg bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
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
              </>
            )}
          </CardContent>
        </Card>
      ) : readiness.ok && classes.length > 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Everything checks out. Click <span className="font-medium">Generate timetable</span> to
            create the weekly schedule.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
