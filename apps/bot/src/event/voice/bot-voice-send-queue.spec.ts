import { BotVoiceSendQueue } from './bot-voice-send-queue';

describe('BotVoiceSendQueue', () => {
  it('같은 key의 task는 enqueue 호출 순서대로 실행된다', async () => {
    const queue = new BotVoiceSendQueue();
    const order: number[] = [];

    const first = queue.enqueue('guild-1:user-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(1);
    });
    const second = queue.enqueue('guild-1:user-1', async () => {
      order.push(2);
    });

    await Promise.all([first, second]);

    expect(order).toEqual([1, 2]);
  });

  it('먼저 시작한 task가 늦게 끝나도(재시도 지연) 뒤 task는 그 완료를 기다린다', async () => {
    const queue = new BotVoiceSendQueue();
    const order: string[] = [];

    // 첫 task: leave 재시도 지연을 흉내낸 느린 작업
    const slowLeave = queue.enqueue('guild-1:user-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('leave(retried)');
    });
    // 뒤이어 도착한 join — 큐에 의해 leave 완료 후에만 실행되어야 함
    const fastJoin = queue.enqueue('guild-1:user-1', async () => {
      order.push('join');
    });

    await Promise.all([slowLeave, fastJoin]);

    expect(order).toEqual(['leave(retried)', 'join']);
  });

  it('서로 다른 key의 task는 병렬로 실행된다(상호 대기 없음)', async () => {
    const queue = new BotVoiceSendQueue();
    const order: string[] = [];

    const slow = queue.enqueue('guild-1:user-1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push('user-1');
    });
    const fast = queue.enqueue('guild-1:user-2', async () => {
      order.push('user-2');
    });

    await Promise.all([slow, fast]);

    // user-2는 user-1의 큐와 무관하므로 먼저 끝난다
    expect(order).toEqual(['user-2', 'user-1']);
  });

  it('앞선 task가 실패해도 뒤 task는 계속 실행되고, 각자의 결과/에러가 호출자에게 전파된다', async () => {
    const queue = new BotVoiceSendQueue();

    const failing = queue.enqueue('guild-1:user-1', async () => {
      throw new Error('send failed');
    });
    const succeeding = queue.enqueue('guild-1:user-1', async () => 'ok');

    await expect(failing).rejects.toThrow('send failed');
    await expect(succeeding).resolves.toBe('ok');
  });
});
