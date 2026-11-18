import { defineConfig } from "drizzle-kit";

// db:generate는 DB 없이 schema.ts만 보고 drizzle/에 SQL을 만든다.
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
