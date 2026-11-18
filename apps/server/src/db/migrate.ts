import { migrate } from "drizzle-orm/mysql2/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./index";

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * drizzle/ 폴더의 마이그레이션 중 아직 안 넣은 것을 적용한다.
 * 서버가 뜰 때 먼저 돈다(index.ts) — push → 배포만으로 스키마도 따라온다.
 * MySQL DDL은 트랜잭션으로 되돌릴 수 없으니, 칸을 지우거나 이름을 바꾸는 변경은
 * 그 칸을 안 쓰는 코드를 먼저 배포한 뒤 다음 배포에서 한다.
 */
export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: MIGRATIONS });
}

// bun run db:migrate — 서버를 띄우지 않고 마이그레이션만
if (import.meta.main) {
  const { getDatabaseUrl } = await import("../env");
  const { createDb } = await import("./index");
  const conn = createDb(getDatabaseUrl());
  try {
    await runMigrations(conn.db);
    console.log("마이그레이션 완료");
  } finally {
    await conn.close();
  }
}
