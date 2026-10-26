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

/** F-USAGE-061 — `guild.members.me?.permissions.bitfield.toString()` 읽기 대상 목. */
function makeGuildWithPermissions(bitfield: bigint | 'throw' | undefined): Guild {
  if (bitfield === 'throw') {
    return {
      id: 'guild-1',
      get members() {
        throw new Error('members access failed');
      },
    } as unknown as Guild;
  }
  return {
    id: 'guild-1',
    members: {
      me:
        bitfield === undefined
          ? null
          : { permissions: { bitfield: { toString: () => bitfield.toString() } } },
    },
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

  describe('permissionsSnapshot — F-USAGE-061/EC-USAGE-27/38', () => {
    it('members.me가 있으면 bitfield를 10진 문자열로 payload에 포함한다', async () => {
      const guild = makeGuildWithPermissions(2248473n);

      await handler.handleGuildCreate(guild);

      expect(apiClient.sendGuildLifecycleEvent).toHaveBeenCalledWith({
        guildId: 'guild-1',
        eventType: 'join',
        permissionsSnapshot: '2248473',
      });
    });

    it('members.me가 없으면(null) permissionsSnapshot 필드 자체를 생략한다("0"이 아님)', async () => {
      const guild = makeGuildWithPermissions(undefined);

      await handler.handleGuildCreate(guild);

      const payload = apiClient.sendGuildLifecycleEvent.mock.calls[0][0];
      expect(payload).not.toHaveProperty('permissionsSnapshot');
      expect(Object.keys(payload).sort()).toEqual(['eventType', 'guildId']);
    });

    it('members 접근이 예외를 던지면 필드를 생략하고도 join 전송은 계속된다', async () => {
      const guild = makeGuildWithPermissions('throw');

      await handler.handleGuildCreate(guild);

      expect(apiClient.sendGuildLifecycleEvent).toHaveBeenCalledTimes(1);
      const payload = apiClient.sendGuildLifecycleEvent.mock.calls[0][0];
      expect(payload).toEqual({ guildId: 'guild-1', eventType: 'join' });
    });

    it('members 접근 예외 시 logger.warn을 남긴다', async () => {
      const warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined as never);
      const guild = makeGuildWithPermissions('throw');

      await handler.handleGuildCreate(guild);

      expect(warnSpy).toHaveBeenCalled();
    });

    it('handleGuildDelete(leave)는 permissionsSnapshot을 읽지 않는다(join 전용 필드)', async () => {
      const guild = makeGuildWithPermissions(2248473n);

      await handler.handleGuildDelete(guild);

      expect(apiClient.sendGuildLifecycleEvent).toHaveBeenCalledWith({
        guildId: 'guild-1',
        eventType: 'leave',
      });
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
