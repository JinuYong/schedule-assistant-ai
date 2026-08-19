/** OAuth 토큰 공통 형태 (Google / Microsoft 공용) */
export interface BaseTokens {
  access_token: string;
  refresh_token?: string;
  /** 토큰 교환/갱신 응답에 포함되는 만료까지 남은 초 */
  expires_in?: number;
  token_type?: string;
  /**
   * 실제로 승인된 권한 목록 (공백 구분).
   *
   * 사용자가 동의 화면에서 일부 권한을 해제할 수 있으므로 요청한 스코프와 다를 수 있다.
   * `findMissingScopes`가 이 값으로 필수 권한 누락을 판별한다.
   */
  scope?: string;
  /** 클라이언트에서 계산한 절대 만료 시각 (epoch ms) */
  expiresAt?: number;
}
