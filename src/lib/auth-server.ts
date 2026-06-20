import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { auth } from "./auth";

// Server-side session read. Safe to call from route beforeLoad (runs on the server
// during SSR, RPCs to the server on client navigation).
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const { headers } = getRequest();
  return auth.api.getSession({ headers });
});

// The active organization (with members), read server-side. Preferred over the
// client `useActiveOrganization()` hook, which only fetches when its active-org
// signal changes and so renders empty on a cold load. With no query args,
// getFullOrganization defaults to the session's active organization.
export const getActiveOrganization = createServerFn({ method: "GET" }).handler(async () => {
  const { headers } = getRequest();
  return auth.api.getFullOrganization({ headers });
});
