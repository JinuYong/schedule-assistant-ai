/**
 * 단일 실행(single-flight) 헬퍼.
 *
 * 같은 작업이 동시에 여러 번 호출돼도 진행 중인 Promise 하나만 공유하고,
 * 완료되면 자동으로 비운다. auth.ts 토큰 갱신과 todos.ts fetch에서 반복되던
 * `let p: Promise | null; ...; .finally(() => p = null)` 보일러플레이트를 통합한다.
 */
export interface SingleFlight<T> {
  /** 진행 중인 Promise (없으면 null) */
  readonly inflight: Promise<T> | null;
  /** factory를 실행해 결과 Promise를 inflight로 등록하고 반환 (완료 시 자동 해제) */
  run(factory: () => Promise<T>): Promise<T>;
}

export function createSingleFlight<T>(): SingleFlight<T> {
  let inflight: Promise<T> | null = null;
  return {
    get inflight() {
      return inflight;
    },
    run(factory) {
      inflight = factory().finally(() => {
        inflight = null;
      });
      return inflight;
    },
  };
}
