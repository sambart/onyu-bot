/**
 * BotNewbieMemberAddHandler 단위 테스트.
 *
 * 핵심 회귀(P2): API 실패가 rethrow(HTTP 500)하도록 바뀌면서, 미션 생성(step 3)과
 * 역할 부여(step 4)를 하나의 try/catch로 묶으면 미션 생성 실패가 역할 부여까지 막는
 * 회귀가 생긴다. 본 스펙은 step 3 실패가 step 4를 막지 않음을 직접 검증한다.
 */
import type { BotApiClientService, NewbieConfigDto } from '@onyu/bot-api-client';
import type { Client, GuildMember } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotNewbieMemberAddHandler } from './bot-newbie-member-add.handler';

function makeMember(overrides: Record<string, unknown> = {}): GuildMember {
  return {
    id: 'member-1',
    displayName: '동현',
    nickname: null,
    joinedAt: new Date('2026-03-01T00:00:00Z'),
    user: { username: 'donghyun', bot: false },
    guild: { id: 'guild-1', memberCount: 100, name: '테스트 서버' },
    displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
    roles: { add: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  } as unknown as GuildMember;
}

function makeConfig(overrides: Partial<NewbieConfigDto> = {}): NewbieConfigDto {
  return {
    welcomeEnabled: false,
    welcomeChannelId: null,
    welcomeContent: null,
    welcomeEmbedTitle: null,
    welcomeEmbedDescription: null,
    welcomeEmbedColor: null,
    welcomeEmbedThumbnailUrl: null,
    missionEnabled: false,
    roleEnabled: false,
    newbieRoleId: null,
    roleDurationDays: null,
    ...overrides,
  };
}

describe('BotNewbieMemberAddHandler', () => {
  let handler: BotNewbieMemberAddHandler;
  let apiClient: {
    upsertGuildMember: Mock;
    getNewbieConfig: Mock;
    sendMemberJoin: Mock;
    notifyRoleAssigned: Mock;
  };
  let discordClient: { channels: { fetch: Mock } };
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiClient = {
      upsertGuildMember: vi.fn().mockResolvedValue(undefined),
      getNewbieConfig: vi.fn().mockResolvedValue(null),
      sendMemberJoin: vi.fn().mockResolvedValue(undefined),
      notifyRoleAssigned: vi.fn().mockResolvedValue(undefined),
    };
    discordClient = {
      channels: { fetch: vi.fn().mockResolvedValue(null) },
    };

    handler = new BotNewbieMemberAddHandler(
      apiClient as unknown as BotApiClientService,
      discordClient as unknown as Client,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loggerErrorSpy = vi.spyOn((handler as any).logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────
  // guild-member upsert — 설정과 무관하게 항상 실행
  // ──────────────────────────────────────────────────────
  describe('guild-member upsert', () => {
    it('newbie 설정과 무관하게 항상 upsertGuildMember를 호출한다', async () => {
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.upsertGuildMember).toHaveBeenCalledWith(
        expect.objectContaining({ guildId: 'guild-1', userId: 'member-1' }),
      );
    });

    it('upsertGuildMember 실패해도 이후 로직(config 조회)이 계속 진행된다', async () => {
      apiClient.upsertGuildMember.mockRejectedValue(new Error('upsert failed'));
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.getNewbieConfig).toHaveBeenCalledWith('guild-1');
    });
  });

  // ──────────────────────────────────────────────────────
  // config null — early return
  // ──────────────────────────────────────────────────────
  describe('config가 null이면', () => {
    it('환영/미션/역할 로직을 전혀 실행하지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(null);
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(discordClient.channels.fetch).not.toHaveBeenCalled();
      expect(apiClient.sendMemberJoin).not.toHaveBeenCalled();
      expect(member.roles.add).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // 환영인사 — welcomeEnabled / welcomeChannelId 분기
  // ──────────────────────────────────────────────────────
  describe('환영인사 (welcomeEnabled/welcomeChannelId 분기)', () => {
    it('welcomeEnabled=true, welcomeChannelId 설정 시 채널을 조회하여 메시지를 전송한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ welcomeEnabled: true, welcomeChannelId: 'ch-1' }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        send,
      });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(discordClient.channels.fetch).toHaveBeenCalledWith('ch-1');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('welcomeEnabled=false이면 채널을 조회하지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ welcomeEnabled: false, welcomeChannelId: 'ch-1' }),
      );
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(discordClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('welcomeChannelId가 null이면 welcomeEnabled=true여도 채널을 조회하지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ welcomeEnabled: true, welcomeChannelId: null }),
      );
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(discordClient.channels.fetch).not.toHaveBeenCalled();
    });

    it('환영 메시지 전송 실패는 격리되어 이후 미션/역할 로직을 막지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          missionEnabled: true,
          roleEnabled: true,
          newbieRoleId: 'role-1',
        }),
      );
      discordClient.channels.fetch.mockRejectedValue(new Error('channel fetch failed'));
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.sendMemberJoin).toHaveBeenCalledTimes(1);
      expect(member.roles.add).toHaveBeenCalledWith('role-1');
    });
  });

  // ──────────────────────────────────────────────────────
  // 미션 생성 (missionEnabled 분기)
  // ──────────────────────────────────────────────────────
  describe('미션 생성 (missionEnabled 분기)', () => {
    it('missionEnabled=true이면 sendMemberJoin을 호출한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(makeConfig({ missionEnabled: true }));
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.sendMemberJoin).toHaveBeenCalledWith({
        guildId: 'guild-1',
        memberId: 'member-1',
        displayName: '동현',
      });
    });

    it('missionEnabled=false이면 sendMemberJoin을 호출하지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(makeConfig({ missionEnabled: false }));
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.sendMemberJoin).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // 역할 부여 (roleEnabled/newbieRoleId 분기)
  // ──────────────────────────────────────────────────────
  describe('역할 부여 (roleEnabled/newbieRoleId 분기)', () => {
    it('roleEnabled=true, newbieRoleId 설정 시 역할을 부여하고 API에 통보한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(member.roles.add).toHaveBeenCalledWith('role-1');
      expect(apiClient.notifyRoleAssigned).toHaveBeenCalledWith({
        guildId: 'guild-1',
        memberId: 'member-1',
      });
    });

    it('roleEnabled=false이면 역할을 부여하지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: false, newbieRoleId: 'role-1' }),
      );
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('newbieRoleId가 null이면 roleEnabled=true여도 역할을 부여하지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: null }),
      );
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('역할 부여(roles.add) 실패는 격리되어 예외를 전파하지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      const member = makeMember({
        roles: { add: vi.fn().mockRejectedValue(new Error('missing permission')) },
      });

      await expect(handler.handleGuildMemberAdd(member)).resolves.toBeUndefined();
      expect(apiClient.notifyRoleAssigned).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // P2 핵심: 미션 실패가 역할 부여를 막지 않는다 (step 격리)
  // ──────────────────────────────────────────────────────
  describe('P2: 미션 생성(step 3) 실패가 역할 부여(step 4)를 막지 않는다', () => {
    it('sendMemberJoin이 rejected되어도 roles.add와 notifyRoleAssigned는 정상 실행된다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ missionEnabled: true, roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      apiClient.sendMemberJoin.mockRejectedValue(new Error('mission API 500'));
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.sendMemberJoin).toHaveBeenCalledTimes(1);
      expect(member.roles.add).toHaveBeenCalledWith('role-1');
      expect(apiClient.notifyRoleAssigned).toHaveBeenCalledWith({
        guildId: 'guild-1',
        memberId: 'member-1',
      });
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('sendMemberJoin 실패 시에도 handleGuildMemberAdd 자체는 예외 없이 완료된다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ missionEnabled: true, roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      apiClient.sendMemberJoin.mockRejectedValue(new Error('mission API 500'));
      const member = makeMember();

      await expect(handler.handleGuildMemberAdd(member)).resolves.toBeUndefined();
    });
  });
});
