/**
 * API 레이어 공통 에러 타입.
 * 문자열 prefix(`auth_error:`) 매칭 대신 `instanceof`로 분기한다.
 */

/** 토큰 갱신/인증 실패 — 재연결(재인증)이 필요한 상태 */
export class AuthError extends Error {
  readonly needsReauth = true;
  constructor(message = "인증이 만료되었습니다. 다시 연결해주세요.") {
    super(message);
    this.name = "AuthError";
  }
}

/** 레이트 리밋(429) — `retryAfter`초 후 재시도 가능 */
export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number, message = "API 사용량을 초과했습니다. 잠시 후 다시 시도해주세요.") {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}