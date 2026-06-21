import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env";
import * as appSchema from "./schema/app";
import * as authSchema from "./schema/auth";

const schema = { ...appSchema, ...authSchema };

// Reuse one postgres client across HMR reloads in dev so we don't exhaust connections.
const globalForDb = globalThis as unknown as {
  _pgClient?: ReturnType<typeof postgres>;
};

const client = globalForDb._pgClient ?? postgres(env.DATABASE_URL, { max: 10 });
if (!globalForDb._pgClient) {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });
