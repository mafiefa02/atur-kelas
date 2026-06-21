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

// Serverless-safe pooling: each function instance holds at most one connection, and
// `prepare: false` is required behind a transaction-mode pooler (Supabase :6543, Neon
// pooler) which cannot keep prepared statements across multiplexed connections. Safe for
// local dev too. Point DATABASE_URL at the *pooled* endpoint in production; run drizzle
// migrations against the direct connection instead.
const client = globalForDb._pgClient ?? postgres(env.DATABASE_URL, { max: 1, prepare: false });
if (!globalForDb._pgClient) {
  globalForDb._pgClient = client;
}

export const db = drizzle(client, { schema });
