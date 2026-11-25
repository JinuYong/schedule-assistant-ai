// 앱(apps/app)과 서버(apps/server)가 같이 쓰는 API 형식.
// 런타임 의존은 zod 하나. 앱은 타입만 가져다 써도 된다.
export * from "./auth";
export * from "./todos";
export * from "./recurrence";
export * from "./memos";
export * from "./places";
