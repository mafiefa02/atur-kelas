import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSession } from "#/lib/auth-server.ts";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const data = await getSession();
    throw redirect({ to: data?.user ? "/dashboard" : "/login" });
  },
});
