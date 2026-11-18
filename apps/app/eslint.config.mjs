// ESLint flat config.
// react-hooks recommended를 켠다(React Compiler 기반 규칙 포함 — effect 안 setState, 선언 전 사용 등).
// typescript-eslint는 TS 문법을 읽는 파서로만 쓴다(@eslint/js·typescript-eslint recommended는 아직 안 켬 → 별도 정리 작업).
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["out/**", "dist/**", "node_modules/**", "src-tauri/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.base, reactHooks.configs.flat.recommended],
  },
);
