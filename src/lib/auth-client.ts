import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// baseURL omitted — defaults to the current origin, where /api/auth/* is served.
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
