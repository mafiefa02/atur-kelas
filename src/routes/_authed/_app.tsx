import {
  BellIcon,
  BookOpenIcon,
  CalendarBlankIcon,
  CalendarDotsIcon,
  ChalkboardTeacherIcon,
  ClipboardTextIcon,
  GraduationCapIcon,
  HouseIcon,
  ListChecksIcon,
  ListIcon,
  ShareNetworkIcon,
  SignOutIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { type ComponentType, useState } from "react";

import { firstIncompleteStep } from "#/components/onboarding/chrome.tsx";
import { buttonVariants } from "#/components/ui/button.tsx";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "#/components/ui/menu.tsx";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "#/components/ui/sheet.tsx";
import { authClient } from "#/lib/auth-client.ts";
import { getOnboardingState } from "#/lib/server/onboarding.ts";

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> };
type NavSection = { label: string | null; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ to: "/dashboard", label: "Dashboard", icon: HouseIcon }],
  },
  {
    label: "Timetabling",
    items: [
      { to: "/timetable", label: "Timetable", icon: CalendarDotsIcon },
      { to: "/share", label: "Share links", icon: ShareNetworkIcon },
    ],
  },
  {
    label: "Setup",
    items: [
      { to: "/terms", label: "Terms", icon: CalendarBlankIcon },
      { to: "/grades", label: "Grade levels", icon: GraduationCapIcon },
      { to: "/subjects", label: "Subjects", icon: BookOpenIcon },
      { to: "/teachers", label: "Teachers", icon: ChalkboardTeacherIcon },
      { to: "/schedule", label: "Bell schedule", icon: BellIcon },
      { to: "/classes", label: "Classes", icon: UsersThreeIcon },
      { to: "/curriculum", label: "Curriculum", icon: ListChecksIcon },
      { to: "/assignments", label: "Assignments", icon: ClipboardTextIcon },
    ],
  },
];

export const Route = createFileRoute("/_authed/_app")({
  beforeLoad: ({ context }) => {
    if (!context.session?.activeOrganizationId) {
      throw redirect({ to: "/onboarding" });
    }
  },
  loader: async () => {
    const state = await getOnboardingState();
    if (!state.hasOrg) {
      throw redirect({ to: "/onboarding" });
    }
    return state;
  },
  component: AppLayout,
});

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

const navLinkClass =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
const navLinkActiveClass =
  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium bg-muted text-foreground";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
      {NAV_SECTIONS.map((section) => (
        <div
          key={section.label ?? "home"}
          className="flex flex-col gap-0.5"
        >
          {section.label ? (
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {section.label}
            </p>
          ) : null}
          {section.items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={navLinkClass}
                activeProps={{ className: navLinkActiveClass }}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AppLayout() {
  const state = Route.useLoaderData();
  const { schoolName, activeTerm } = state;
  const setupIncomplete = firstIncompleteStep(state) !== null;
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  const wordmark = (
    <span className="font-heading text-base font-semibold tracking-tight">atur&#8209;kelas</span>
  );

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex h-14 flex-none items-center gap-3 border-b border-border bg-card px-4 md:px-6">
        <Sheet
          open={mobileOpen}
          onOpenChange={setMobileOpen}
        >
          <SheetTrigger
            aria-label="Open navigation"
            className="-ml-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 md:hidden"
          >
            <ListIcon className="size-5" />
          </SheetTrigger>
          <SheetContent side="left">
            <div className="flex h-14 flex-none items-center border-b border-border px-5">
              {wordmark}
            </div>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <Link
          to="/dashboard"
          className="text-foreground"
        >
          {wordmark}
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {setupIncomplete ? (
            <Link
              to="/onboarding"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Continue setup
            </Link>
          ) : null}
          <span className="hidden max-w-[40vw] truncate text-[13px] text-muted-foreground sm:block">
            {schoolName ?? "School"}
            {activeTerm ? ` · ${activeTerm.name}` : ""}
          </span>
          <Menu>
            <MenuTrigger
              aria-label="Account"
              className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground uppercase ring-1 ring-foreground/5 outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {initials(user.name)}
            </MenuTrigger>
            <MenuContent align="end">
              <div className="px-2 py-1.5">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <MenuSeparator />
              <MenuItem onClick={handleSignOut}>
                <SignOutIcon /> Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-muted/20 md:flex">
          <SidebarNav />
        </aside>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
