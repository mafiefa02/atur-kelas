import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getSession } from "#/lib/auth-server.ts";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async () => {
    const data = await getSession();
    if (!data?.user) {
      throw redirect({ to: "/login" });
    }
    // Expose to child routes via context.
    return { user: data.user, session: data.session };
  },
  component: () => <Outlet />,
});
