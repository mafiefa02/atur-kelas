import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import { Button } from "#/components/ui/button.tsx";
import { authClient } from "#/lib/auth-client.ts";
import { getActiveOrganization } from "#/lib/auth-server.ts";
import { listTerms } from "#/lib/server/terms.ts";

const ENABLED_NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/timetable", label: "Timetable" },
  { to: "/share", label: "Share links" },
  { to: "/terms", label: "Terms" },
  { to: "/grades", label: "Grade levels" },
  { to: "/subjects", label: "Subjects" },
  { to: "/teachers", label: "Teachers" },
  { to: "/schedule", label: "Bell schedule" },
  { to: "/classes", label: "Classes" },
  { to: "/curriculum", label: "Curriculum" },
  { to: "/assignments", label: "Assignments" },
] as const;

const COMING_SOON: string[] = [];

export const Route = createFileRoute("/_authed/_app")({
  beforeLoad: ({ context }) => {
    if (!context.session?.activeOrganizationId) {
      throw redirect({ to: "/onboarding" });
    }
  },
  loader: async () => {
    const [org, terms] = await Promise.all([getActiveOrganization(), listTerms()]);
    return { org, activeTerm: terms.find((t) => t.isActive) ?? null };
  },
  component: AppLayout,
});

function AppLayout() {
  const { org, activeTerm } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();

  async function handleSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-60 shrink-0 flex-col gap-4 border-r border-border bg-muted/20 p-4">
        <div>
          <p className="font-heading text-sm font-semibold">{org?.name ?? "School"}</p>
          <p className="text-xs text-muted-foreground">
            {activeTerm ? activeTerm.name : "No active term"}
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {ENABLED_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              activeProps={{
                className: "rounded-lg px-3 py-2 text-sm bg-muted font-medium text-foreground",
              }}
            >
              {item.label}
            </Link>
          ))}
          {COMING_SOON.length > 0 ? (
            <p className="mt-3 px-3 text-xs font-medium tracking-wide text-muted-foreground/60 uppercase">
              Coming soon
            </p>
          ) : null}
          {COMING_SOON.map((label) => (
            <span
              key={label}
              className="cursor-not-allowed rounded-lg px-3 py-2 text-sm text-muted-foreground/40"
              title="Coming soon"
            >
              {label}
            </span>
          ))}
        </nav>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
        >
          Sign out
        </Button>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
