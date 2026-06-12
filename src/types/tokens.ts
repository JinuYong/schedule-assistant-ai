/** OAuth 토큰 공통 형태 (Google / Microsoft 공용) */
export interface BaseTokens {
  access_token: string;
  refresh_token?: string;
  /** 토큰 교환/갱신 응답에 포함되는 만료까지 남은 초 */
  expires_in?: number;
  token_type?: string;
  /** 클라이언트에서 계산한 절대 만료 시각 (epoch ms) */
  expiresAt?: number;
}
