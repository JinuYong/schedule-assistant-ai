import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import MainLayout from "@/routes/main-layout";
import SchedulePage from "@/routes/schedule/page";
import TodoPage from "@/routes/todo/page";
import ChatPage from "@/routes/chat/page";
import SettingsPage from "@/routes/settings/page";

// 메인 창 라우트. 화면이 다섯 개뿐이라 파일 기반 라우팅 대신 여기서 직접 묶는다.
const rootRoute = createRootRoute({ component: MainLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/schedule", replace: true });
  },
});

const scheduleRoute = createRoute({ getParentRoute: () => rootRoute, path: "/schedule", component: SchedulePage });
const todoRoute = createRoute({ getParentRoute: () => rootRoute, path: "/todo", component: TodoPage });
const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: "/chat", component: ChatPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });

const routeTree = rootRoute.addChildren([indexRoute, scheduleRoute, todoRoute, chatRoute, settingsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
