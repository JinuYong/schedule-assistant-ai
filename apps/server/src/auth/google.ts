import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}

export type VerifyGoogleIdToken = (idToken: string) => Promise<GoogleProfile>;

export class InvalidIdTokenError extends Error {}

/**
 * Google id_token을 검증한다: Google 공개키 서명, 발급자, 대상(aud = 우리 OAuth 클라이언트), 만료, 이메일 확인.
 * audiences는 앱 OAuth 클라이언트 ID들(데스크톱, 나중에 안드로이드).
 * jwks는 테스트에서 로컬 키로 바꿔 끼운다. 기본은 Google 공개키(jose가 캐시·갱신).
 */
export function createGoogleVerifier(opts: {
  audiences: string[];
  jwks?: JWTVerifyGetKey;
}): VerifyGoogleIdToken {
  const jwks = opts.jwks ?? createRemoteJWKSet(GOOGLE_JWKS_URL);

  return async (idToken) => {
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks, {
        issuer: GOOGLE_ISSUERS,
        audience: opts.audiences,
        algorithms: ["RS256"],
        clockTolerance: 30,
      }));
    } catch (err) {
      throw new InvalidIdTokenError(
        err instanceof Error ? err.message : "검증 실패",
      );
    }

    const { sub, email, email_verified, name, picture } = payload;
    if (typeof sub !== "string" || !sub)
      throw new InvalidIdTokenError("sub 없음");
    if (typeof email !== "string" || !email)
      throw new InvalidIdTokenError("email 없음 — scope에 email이 빠졌다");
    if (email_verified !== true)
      throw new InvalidIdTokenError("확인되지 않은 이메일");

    return {
      sub,
      email,
      name: typeof name === "string" ? name : null,
      pictureUrl: typeof picture === "string" ? picture : null,
    };
  };
}
