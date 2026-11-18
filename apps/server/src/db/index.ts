import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = mysql.createPool({
    uri: url,
    // JS Date를 UTC로 쓰고 읽는다. 시각 칸은 모두 UTC (schema.ts)
    timezone: "Z",
    connectionLimit: 5,
    enableKeepAlive: true,
  });
  const db = drizzle(pool, { schema, mode: "default", casing: "snake_case" });

  return {
    db,
    pool,
    async check() {
      await db.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
}

export type Db = ReturnType<typeof createDb>["db"];
