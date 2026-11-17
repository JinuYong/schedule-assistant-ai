import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Tauri가 이 결과물을 앱에 싣는다 (src-tauri/tauri.conf.json의 frontendDist).
// out/을 쓰는 이유: dist/는 릴리스 워크플로가 dmg를 모으는 폴더라 섞이지 않게 한다.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Tauri CLI 로그가 지워지지 않게
  clearScreen: false,
  server: {
    port: 3100,
    // tauri.conf.json의 devUrl이 3100 고정이라 다른 포트로 뜨면 창이 빈다
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    outDir: "out",
    rollupOptions: {
      // 창마다 진입점이 따로다. 플로팅 창은 단축키로 자주 열리니 메인 화면 코드를 싣지 않는다.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        floating: fileURLToPath(new URL("./floating.html", import.meta.url)),
      },
    },
  },
});
