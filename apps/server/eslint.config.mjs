// 서버는 새 코드라 typescript-eslint recommended를 처음부터 켠다(앱은 파서만 쓴다 — apps/app/eslint.config.mjs 참고).
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "drizzle/**"] },
  { files: ["**/*.ts"], extends: [tseslint.configs.recommended] },
);
