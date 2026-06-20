// Server-only environment access. Loads .env.local for local dev; in production the
// host provides the real vars and the file is absent (the load is a no-op then).
//
// Do NOT import this from client code — it reads secrets and uses Node APIs.

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local absent (e.g. production / CI) — fall back to the real process.env.
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
};
