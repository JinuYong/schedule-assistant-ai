import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import Providers from "@/components/providers";
import SignInGate from "@/components/sign-in-gate";
import { router } from "@/router";
import "@/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <SignInGate>
        <RouterProvider router={router} />
      </SignInGate>
    </Providers>
  </StrictMode>,
);
