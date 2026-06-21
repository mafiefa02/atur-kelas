import { PrinterIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";

import { AgendaTimetable } from "#/components/agenda-timetable.tsx";
import { getPublicClassTimetable } from "#/lib/server/public.ts";

export const Route = createFileRoute("/p/$token")({
  loader: ({ params }) => getPublicClassTimetable({ data: { token: params.token } }),
  component: PublicTimetable,
});

// "2026-06-21T..." -> "21/06/2026"
function fmtDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-6">{children}</div>;
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

  return (
    <Shell>
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          aria-label="Print"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PrinterIcon className="size-5" />
        </button>
      </div>

      <AgendaTimetable
        className="flex-1"
        slots={slots}
        cells={cells}
        eyebrow="Jadwal Pelajaran"
        title={`${gradeName} · ${className}`}
        subtitle={
          <>
            {schoolName}
            {publishedAt ? ` · diperbarui ${fmtDate(publishedAt)}` : ""}
          </>
        }
        footer={
          <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
            Dibuat dengan <span className="font-semibold text-foreground">atur-kelas</span>
          </p>
        }
      />
    </Shell>
  );
}
