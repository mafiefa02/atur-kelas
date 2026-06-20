import { createFileRoute } from "@tanstack/react-router";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { getActiveOrganization } from "#/lib/auth-server.ts";

export const Route = createFileRoute("/_authed/_app/dashboard")({
  loader: () => getActiveOrganization(),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = Route.useRouteContext();
  const activeOrg = Route.useLoaderData();
  const myRole = activeOrg?.members?.find((m) => m.userId === user.id)?.role ?? "—";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">{activeOrg?.name ?? "School"}</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.name} ({user.email})
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Welcome to atur-kelas</CardTitle>
          <CardDescription>
            Set up your school below, then generate timetables. Start with Terms, then add grade
            levels, subjects, teachers, classes, and the bell schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-muted-foreground">School</p>
            <p className="font-medium">{activeOrg?.name ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-muted-foreground">Slug</p>
            <p className="font-mono font-medium">{activeOrg?.slug ?? "—"}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-muted-foreground">Members</p>
            <p className="font-medium">{activeOrg?.members?.length ?? 0}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-muted-foreground">Your role</p>
            <p className="font-medium">{myRole}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
