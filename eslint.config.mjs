// ESLint 9 flat config — eslint-config-next 16의 네이티브 flat config를 직접 사용.
// (FlatCompat 경유 시 react 플러그인 순환참조로 config-validator가 크래시함)
import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: ["out/**", ".next/**", "node_modules/**", "src-tauri/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
