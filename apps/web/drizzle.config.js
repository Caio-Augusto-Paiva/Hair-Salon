import { defineConfig } from "drizzle-kit";

const directConnectionUrl = process.env.DATABASE_DIRECT_URL;

if (!directConnectionUrl) {
  throw new Error("DATABASE_DIRECT_URL is required for Drizzle Kit");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema/index.js",
  dialect: "postgresql",
  dbCredentials: {
    url: directConnectionUrl,
  },
});
