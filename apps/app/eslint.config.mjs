// ESLint 9 flat config.
// Next 시절 eslint-config-next가 켜 주던 규칙 중 이 앱에 의미 있는 react-hooks(7.0.1 recommended)를 그대로 켠다.
// typescript-eslint는 TS 문법을 읽는 파서로만 쓴다.
// 더 엄격한 규칙(react-hooks 7.1+, @eslint/js·typescript-eslint recommended)을 켜면 9건이 걸린다 → 별도 정리 작업.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["out/**", "dist/**", "node_modules/**", "src-tauri/**"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.base, reactHooks.configs.flat.recommended],
  },
);
