/**
 * BotGuildLifecycleHandler 단위 테스트 (F-USAGE-013).
 * 대상: guildCreate → join / guildDelete → leave 전송, payload 최소성(guildId·eventType만,
 * 유저ID·길드명·멤버수 미포함 — 개인 미식별 🔒), API 호출 실패 시 예외 미전파(fire-and-forget).
 */
import { Logger } from '@nestjs/common';
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { Guild } from 'discord.js';
import type { Mocked } from 'vitest';

import { BotGuildLifecycleHandler } from './bot-guild-lifecycle.handler';

function makeGuild(
  overrides: Partial<{ id: string; name: string; memberCount: number }> = {},
): Guild {
  return {
    id: 'guild-1',
    name: 'Test Guild',
    memberCount: 42,
    ...overrides,
  } as unknown as Guild;
}

describe('BotGuildLifecycleHandler', () => {
  let handler: BotGuildLifecycleHandler;
  let apiClient: Mocked<BotApiClientService>;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined as never);
    apiClient = {
      sendGuildLifecycleEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<BotApiClientService>;
    handler = new BotGuildLifecycleHandler(apiClient);
  });

  describe('handleGuildCreate (F-USAGE-013)', () => {
    it('guild.id와 eventType:"join"으로 sendGuildLifecycleEvent를 1회 호출한다', async () => {
      const guild = makeGuild({ id: 'guild-42' });

      await handler.handleGuildCreate(guild);

      expect(apiClient.sendGuildLifecycleEvent).toHaveBeenCalledTimes(1);
      expect(apiClient.sendGuildLifecycleEvent).toHaveBeenCalledWith({
        guildId: 'guild-42',
        eventType: 'join',
      });
    });
  });

  describe('handleGuildDelete (F-USAGE-013)', () => {
    it('guild.id와 eventType:"leave"로 sendGuildLifecycleEvent를 1회 호출한다', async () => {
      const guild = makeGuild({ id: 'guild-42' });

      await handler.handleGuildDelete(guild);

      expect(apiClient.sendGuildLifecycleEvent).toHaveBeenCalledTimes(1);
      expect(apiClient.sendGuildLifecycleEvent).toHaveBeenCalledWith({
        guildId: 'guild-42',
        eventType: 'leave',
      });
    });
  });

  describe('payload 최소성 — 개인 미식별(🔒)', () => {
    it('payload에 guildId·eventType 외 다른 필드(길드명·멤버수)를 포함하지 않는다', async () => {
      const guild = makeGuild({ id: 'guild-1', name: 'Secret Guild', memberCount: 999 });

      await handler.handleGuildCreate(guild);

      const payload = apiClient.sendGuildLifecycleEvent.mock.calls[0][0];
      expect(Object.keys(payload).sort()).toEqual(['eventType', 'guildId']);
    });
  });

  describe('fire-and-forget — API 실패 시 예외 미전파', () => {
    it('sendGuildLifecycleEvent가 reject해도 handleGuildCreate는 예외를 던지지 않고 logger.error를 남긴다', async () => {
      const errorSpy = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined as never);
      apiClient.sendGuildLifecycleEvent.mockRejectedValue(new Error('network error'));
      const guild = makeGuild();

      await expect(handler.handleGuildCreate(guild)).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
    });

    it('sendGuildLifecycleEvent가 reject해도 handleGuildDelete는 예외를 던지지 않는다', async () => {
      apiClient.sendGuildLifecycleEvent.mockRejectedValue(new Error('network error'));
      const guild = makeGuild();

      await expect(handler.handleGuildDelete(guild)).resolves.toBeUndefined();
    });
  });
});
