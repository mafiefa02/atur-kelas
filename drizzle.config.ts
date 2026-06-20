import { defineConfig } from "drizzle-kit";

// drizzle-kit runs as its own process and doesn't auto-load .env.local.
try {
  process.loadEnvFile(".env.local");
} catch {
  // absent in CI/production — rely on the real process.env
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
