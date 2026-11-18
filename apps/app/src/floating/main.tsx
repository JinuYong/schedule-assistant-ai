import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Providers from "@/components/providers";
import FloatingLayout from "./layout";
import FloatingPage from "./page";
import "@/globals.css";

// 플로팅 창 전용 진입점 (floating.html). 라우터 없이 화면 하나만 띄운다.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <FloatingLayout>
        <FloatingPage />
      </FloatingLayout>
    </Providers>
  </StrictMode>,
);
