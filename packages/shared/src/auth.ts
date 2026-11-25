import { z } from "zod";

/** POST /auth/google — 앱이 Google 로그인으로 받은 id_token */
export const googleLoginBody = z.object({
  idToken: z.string().min(1).max(8192),
});
export type GoogleLoginBody = z.infer<typeof googleLoginBody>;

/** 앱에 내보내는 사용자 정보 */
export interface PublicUser {
  id: number;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}

/** POST /auth/google 응답. token은 이후 요청의 Authorization: Bearer 값 */
export interface LoginResponse {
  token: string;
  user: PublicUser;
}

/** GET /me 응답 */
export interface MeResponse {
  user: PublicUser;
}

/** 4xx·5xx 응답 본문 */
export interface ApiError {
  error:
    | "invalid_body"
    | "invalid_token"
    | "unauthorized"
    | "not_found"
    /** 사용자별 하루 한도를 넘음(장소 검색) */
    | "rate_limited"
    /** 서버에 외부 API 키가 없음(장소 검색) */
    | "unavailable"
    /** 외부 API(네이버)가 실패 */
    | "upstream_error";
}
