/**
 * 키(guildId:userId)별 FIFO 전송 순서 보장 큐.
 *
 * `BotVoiceStateDispatcher`의 leave 재시도(§voice-overcount-fix 수정 6)는 실패 시 최대
 * 2~3초 지연 후 재전송한다. 이 지연 동안 같은 유저의 후속 이벤트(rejoin/move 등)가
 * 재시도 없이 즉시 성공하면, API에는 "새 이벤트 → 지연된 leave" 순서로 도착해
 * 방금 생성된 새 세션이 stale leave에 의해 잘못 종료될 수 있다(순서 역전).
 *
 * 이 큐는 같은 key에 대한 전송 작업을 API 도착 순서 = Discord 이벤트 발생 순서가
 * 되도록 직렬화한다(`apps/api`의 `KeyedSerializer`와 동일한 FIFO 체이닝 패턴 —
 * bot/api는 별도 앱이라 공유 모듈 대신 소규모 로컬 구현을 둔다).
 */
export class BotVoiceSendQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  /** 주어진 key 에 대해 task 를 이전 task 완료 후 순차 실행한다. */
  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();

    const result: Promise<T> = prev.then(
      () => task(),
      () => task(),
    );

    const settled: Promise<unknown> = result.then(
      () => undefined,
      () => undefined,
    );
    const cleanup: Promise<unknown> = settled.then(() => {
      if (this.tails.get(key) === cleanup) {
        this.tails.delete(key);
      }
    });
    this.tails.set(key, cleanup);

    return result;
  }
}
