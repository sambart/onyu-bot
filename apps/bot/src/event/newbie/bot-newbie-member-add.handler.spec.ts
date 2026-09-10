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
    welcomeDisplayMode: 'EMBED',
    welcomeEmbedTitle: null,
    welcomeEmbedDescription: null,
    welcomeEmbedColor: null,
    welcomeEmbedThumbnailUrl: null,
    missionEnabled: false,
    missionTargetPlaytimeHours: null,
    missionTargetPlayCount: null,
    missionDurationDays: null,
    missionNotifyChannelId: null,
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
    getWelcomeCard: Mock;
    recordAutoAction: Mock;
    recordNewbieOnboardingFailure: Mock;
  };
  let discordClient: { channels: { fetch: Mock } };
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiClient = {
      upsertGuildMember: vi.fn().mockResolvedValue(undefined),
      getNewbieConfig: vi.fn().mockResolvedValue(null),
      sendMemberJoin: vi.fn().mockResolvedValue(undefined),
      notifyRoleAssigned: vi.fn().mockResolvedValue(undefined),
      getWelcomeCard: vi.fn().mockResolvedValue({ ok: true, imageBase64: 'ZmFrZS1wbmc=' }),
      recordAutoAction: vi.fn().mockResolvedValue(undefined),
      recordNewbieOnboardingFailure: vi.fn().mockResolvedValue(undefined),
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

    // ────────────────────────────────────────────────────
    // EC-NEWBIE-51 / QA O7 — Discord 발송(channel.send) 자체가 실패해도 강등이 아니라
    // 로그 후 조용히 실패한다(재시도 없음). CANVAS 강등 유발 실패(O1 대응 범위)와 달리,
    // 이 테스트는 EMBED 전용 경로(welcomeDisplayMode 미설정=CANVAS 아님)에서 channel.send가
    // throw할 때도 미션 생성·역할 부여(병렬 로직)가 계속 진행되는지 확인한다.
    // ────────────────────────────────────────────────────
    it('EMBED 전용 경로에서 channel.send가 실패해도(권한 부족 등) 재시도 없이 로그만 남기고, 미션/역할 로직은 계속 진행된다(EC-NEWBIE-51)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'EMBED',
          missionEnabled: true,
          roleEnabled: true,
          newbieRoleId: 'role-1',
        }),
      );
      const send = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await expect(handler.handleGuildMemberAdd(member)).resolves.toBeUndefined();

      // EMBED 전용 경로는 CANVAS 강등 재시도 대상이 아니므로 send는 정확히 1회만 호출된다.
      expect(send).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalled();
      // 예외가 핸들러 밖으로 전파되지 않아 미션 생성·역할 부여가 계속 진행된다.
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

  // ──────────────────────────────────────────────────────
  // F-NEWBIE-001-CANVAS — welcomeDisplayMode 분기 + EMBED 강등 폴백 (D12)
  // ──────────────────────────────────────────────────────
  describe('환영인사 표시모드 (welcomeDisplayMode 분기)', () => {
    it("welcomeDisplayMode: 'EMBED'이면 getWelcomeCard를 호출하지 않고 Embed로 발송한다(TC-02-04)", async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ welcomeEnabled: true, welcomeChannelId: 'ch-1', welcomeDisplayMode: 'EMBED' }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.getWelcomeCard).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toHaveProperty('embeds');
    });

    it('welcomeDisplayMode가 undefined(구 캐시)이면 Embed 경로로 처리한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: undefined as unknown as 'EMBED',
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.getWelcomeCard).not.toHaveBeenCalled();
      expect(send.mock.calls[0][0]).toHaveProperty('embeds');
    });

    it("welcomeDisplayMode: 'CANVAS' 정상이면 getWelcomeCard를 정확히 1회 호출하고 files로 발송한다(TC-02-02)", async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.getWelcomeCard).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
      const sentArg = send.mock.calls[0][0] as { files?: unknown[]; embeds?: unknown[] };
      expect(sentArg.files).toHaveLength(1);
      expect(sentArg.embeds).toBeUndefined();
    });

    it('getWelcomeCard 호출 인자가 멤버 컨텍스트와 일치한다(TC-02-02)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      discordClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.getWelcomeCard).toHaveBeenCalledWith({
        guildId: 'guild-1',
        memberId: 'member-1',
        displayName: '동현',
        avatarUrl: 'https://example.com/avatar.png',
        memberCount: 100,
        serverName: '테스트 서버',
      });
    });

    it('getWelcomeCard가 reject(5xx)되면 재시도 없이 Embed로 강등 발송한다(TC-02-06)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      apiClient.getWelcomeCard.mockRejectedValue(new Error('API 500'));
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.getWelcomeCard).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
      const sentArg = send.mock.calls[0][0] as { embeds?: unknown[] };
      expect(sentArg.embeds).toBeDefined();
    });

    it('getWelcomeCard가 reject(401)되어도 동일하게 Embed로 강등한다(TC-02-10)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      apiClient.getWelcomeCard.mockRejectedValue(new Error('401 Unauthorized'));
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      const sentArg = send.mock.calls[0][0] as { embeds?: unknown[] };
      expect(sentArg.embeds).toBeDefined();
    });

    it('imageBase64가 빈 문자열이면 강등 발송으로 처리한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      apiClient.getWelcomeCard.mockResolvedValue({ ok: true, imageBase64: '' });
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      const sentArg = send.mock.calls[0][0] as { embeds?: unknown[] };
      expect(sentArg.embeds).toBeDefined();
    });

    it('강등 Embed는 저장된 Embed 설정값을 그대로 사용한다(TC-02-06c)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
          welcomeEmbedTitle: '환영합니다 {username}',
        }),
      );
      apiClient.getWelcomeCard.mockRejectedValue(new Error('API 500'));
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      const sentArg = send.mock.calls[0][0] as { embeds: Array<{ title?: string }> };
      expect(sentArg.embeds[0].title).toBe('환영합니다 동현');
    });

    it("welcomeEnabled: false이면 'CANVAS' 설정이어도 환영 발송 자체가 없다(TC-02-09)", async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: false,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(discordClient.channels.fetch).not.toHaveBeenCalled();
      expect(apiClient.getWelcomeCard).not.toHaveBeenCalled();
    });

    // ────────────────────────────────────────────────────
    // PR#443 리뷰 결함 #1 — applyTemplate의 String.replace 치환 메타문자 훼손 방지.
    // replacement를 함수로 전달하지 않으면 사용자 제어값(닉네임·서버명) 안의 `$&`/`$$`/`$'` 등이
    // "정규식 치환 특수 패턴"으로 오해석되어 메시지가 훼손된다.
    // ────────────────────────────────────────────────────
    describe('applyTemplate — 특수 치환 메타문자 방지(PR#443 리뷰 결함 #1)', () => {
      it('displayName에 $&(전체 매치 참조 메타문자)가 포함되어도 welcomeContent에 리터럴로 치환된다', async () => {
        const member = makeMember({ displayName: 'user$&name' });
        apiClient.getNewbieConfig.mockResolvedValue(
          makeConfig({
            welcomeEnabled: true,
            welcomeChannelId: 'ch-1',
            welcomeContent: 'Hello {username}!',
          }),
        );
        const send = vi.fn().mockResolvedValue(undefined);
        discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });

        await handler.handleGuildMemberAdd(member);

        // 버그 재현 시: '{username}'가 매치 전체이므로 $&가 '{username}' 자신으로 치환되어
        // 'Hello user{username}name!'처럼 훼손된다.
        expect((send.mock.calls[0][0] as { content?: string }).content).toBe('Hello user$&name!');
      });

      it('displayName에 $$(리터럴 $ 이스케이프 메타문자)가 포함되어도 $ 하나가 소실되지 않는다', async () => {
        const member = makeMember({ displayName: 'user$$name' });
        apiClient.getNewbieConfig.mockResolvedValue(
          makeConfig({
            welcomeEnabled: true,
            welcomeChannelId: 'ch-1',
            welcomeContent: 'Hello {username}!',
          }),
        );
        const send = vi.fn().mockResolvedValue(undefined);
        discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });

        await handler.handleGuildMemberAdd(member);

        // 버그 재현 시: '$$'가 리터럴 '$' 하나로 축약되어 'Hello user$name!'이 된다.
        expect((send.mock.calls[0][0] as { content?: string }).content).toBe('Hello user$$name!');
      });

      it("displayName에 $'(매치 이후 문자열 참조 메타문자)가 포함되어도 리터럴로 치환된다", async () => {
        const member = makeMember({ displayName: "user$'name" });
        apiClient.getNewbieConfig.mockResolvedValue(
          makeConfig({
            welcomeEnabled: true,
            welcomeChannelId: 'ch-1',
            welcomeContent: 'Hello {username}, bye!',
          }),
        );
        const send = vi.fn().mockResolvedValue(undefined);
        discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });

        await handler.handleGuildMemberAdd(member);

        expect((send.mock.calls[0][0] as { content?: string }).content).toBe(
          "Hello user$'name, bye!",
        );
      });

      it('guild.name(serverName)에 $&/$$가 포함되어도 embed title/description에 리터럴로 치환된다', async () => {
        const member = makeMember({
          guild: { id: 'guild-1', memberCount: 100, name: '$&서버$$' },
        });
        apiClient.getNewbieConfig.mockResolvedValue(
          makeConfig({
            welcomeEnabled: true,
            welcomeChannelId: 'ch-1',
            welcomeDisplayMode: 'EMBED',
            welcomeEmbedTitle: '{serverName}에 오신 것을 환영합니다',
            welcomeEmbedDescription: '즐거운 시간 되세요, {serverName}!',
          }),
        );
        const send = vi.fn().mockResolvedValue(undefined);
        discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });

        await handler.handleGuildMemberAdd(member);

        const sentArg = send.mock.calls[0][0] as {
          embeds: Array<{ title?: string; description?: string }>;
        };
        expect(sentArg.embeds[0].title).toBe('$&서버$$에 오신 것을 환영합니다');
        expect(sentArg.embeds[0].description).toBe('즐거운 시간 되세요, $&서버$$!');
      });
    });

    it('Canvas 발송(channel.send) 자체가 실패해도 재시도 없이 로그 후 조용히 종료한다(TC-02-11)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      const send = vi.fn().mockRejectedValue(new Error('Missing Permissions'));
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await expect(handler.handleGuildMemberAdd(member)).resolves.toBeUndefined();
      // Canvas 실패 → EMBED 강등 재시도(1회) → 그 EMBED 발송도 실패 → 상위 catch가 흡수, 총 2회 send 시도
      expect(send).toHaveBeenCalledTimes(2);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // F-NEWBIE-009 (계획 §S1-2 / T2) — 미션 변수 4개가 welcomeContent/embedTitle/embedDescription
  // 3곳 모두에 적용되고, 값 결손 시 조건부 렌더(줄 삭제)까지 실제로 반영되는지 검증한다.
  // ──────────────────────────────────────────────────────
  describe('F-NEWBIE-009 — 미션 안내 변수 치환 (welcome-template.util 통합)', () => {
    it('missionEnabled=true + 전체 필드 설정 시 welcomeContent에 4개 변수가 치환된다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeContent:
            '{username}님 환영합니다! {missionDurationDays}일 동안 {missionTargetPlaytime}시간, {missionTargetPlayCount}회 - {missionChannel}',
          missionEnabled: true,
          missionTargetPlaytimeHours: 20,
          missionTargetPlayCount: 10,
          missionDurationDays: 7,
          missionNotifyChannelId: 'notify-ch',
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect((send.mock.calls[0][0] as { content?: string }).content).toBe(
        '동현님 환영합니다! 7일 동안 20시간, 10회 - <#notify-ch>',
      );
    });

    it('missionEnabled=false이면 미션 안내 줄이 통째로 삭제되고 나머지 문장은 무손상이다(대안 플로우 1)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeContent:
            '{username}님 환영합니다!\n미션이 시작됐어요! {missionDurationDays}일 동안 {missionTargetPlaytime}시간 - {missionChannel}\n즐거운 시간 되세요.',
          missionEnabled: false,
          missionTargetPlaytimeHours: 20,
          missionDurationDays: 7,
          missionNotifyChannelId: 'notify-ch',
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      const content = (send.mock.calls[0][0] as { content?: string }).content;
      expect(content).toBe('동현님 환영합니다!\n즐거운 시간 되세요.');
      expect(content).not.toMatch(/undefined|null|\{mission/);
    });

    it('missionNotifyChannelId=null이면 그 줄만 삭제된다(부분 결손, 대안 플로우 2 인접 케이스)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeContent: '환영합니다!\n{missionChannel}에서 진행 상황을 확인할 수 있어요.',
          missionEnabled: true,
          missionTargetPlaytimeHours: 20,
          missionDurationDays: 7,
          missionNotifyChannelId: null,
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect((send.mock.calls[0][0] as { content?: string }).content).toBe('환영합니다!');
    });

    it('missionTargetPlayCount=null이고 그 변수를 쓰지 않는 문장이면 영향 없다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeContent: '{missionDurationDays}일 동안 {missionTargetPlaytime}시간 채워보세요.',
          missionEnabled: true,
          missionTargetPlaytimeHours: 20,
          missionTargetPlayCount: null,
          missionDurationDays: 7,
          missionNotifyChannelId: 'notify-ch',
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect((send.mock.calls[0][0] as { content?: string }).content).toBe(
        '7일 동안 20시간 채워보세요.',
      );
    });

    it('미션 변수가 전혀 없는 기존 템플릿은 회귀 없이 그대로 유지된다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeContent:
            '{username}님, {serverName}에 오신 것을 환영합니다!\n\n\n즐거운 시간 되세요.',
          missionEnabled: false,
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      // 미션 변수를 전혀 쓰지 않는 템플릿이므로 연속 빈 줄 등 원본 공백 구조까지 완전히 보존
      expect((send.mock.calls[0][0] as { content?: string }).content).toBe(
        '동현님, 테스트 서버에 오신 것을 환영합니다!\n\n\n즐거운 시간 되세요.',
      );
    });

    it('EMBED 모드에서 welcomeEmbedTitle/welcomeEmbedDescription 양쪽에도 조건부 렌더가 적용된다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'EMBED',
          welcomeEmbedTitle: '환영합니다 {username}\n미션: {missionTargetPlaytime}시간',
          welcomeEmbedDescription: '{missionChannel}에서 확인하세요\n다른 안내 문구',
          missionEnabled: true,
          missionTargetPlaytimeHours: 20,
          missionNotifyChannelId: null,
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      const sentArg = send.mock.calls[0][0] as {
        embeds: Array<{ title?: string; description?: string }>;
      };
      // title: missionTargetPlaytime은 채워져 있으므로 두 줄 다 유지 + 치환
      expect(sentArg.embeds[0].title).toBe('환영합니다 동현\n미션: 20시간');
      // description: missionChannel이 비어 있으므로 첫 줄만 삭제
      expect(sentArg.embeds[0].description).toBe('다른 안내 문구');
    });

    it('CANVAS 모드에서도 content(위에 실리는 텍스트)에 미션 변수 조건부 렌더가 적용된다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
          welcomeContent: '{username}님 환영!\n{missionChannel}에서 확인',
          missionEnabled: true,
          missionNotifyChannelId: 'notify-ch',
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect((send.mock.calls[0][0] as { content?: string }).content).toBe(
        '동현님 환영!\n<#notify-ch>에서 확인',
      );
    });

    it('CANVAS 강등(EMBED 폴백) 시에도 미션 변수 조건부 렌더가 적용된다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
          welcomeEmbedTitle: '환영 {username}',
          welcomeEmbedDescription: '{missionChannel}에서 확인\n일반 안내',
          missionEnabled: false,
        }),
      );
      apiClient.getWelcomeCard.mockRejectedValue(new Error('API 500'));
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      const sentArg = send.mock.calls[0][0] as { embeds: Array<{ description?: string }> };
      expect(sentArg.embeds[0].description).toBe('일반 안내');
    });
  });

  // ──────────────────────────────────────────────────────
  // F1(계획 review-575-followup §2-1/§4 T1) — 전처리 결과가 공백뿐이면 임베드 필드/
  // content를 생략해 discord.js validator의 setTitle('')/setDescription('') throw를
  // 원천 차단한다. T1-4는 본 계획 전체에서 가장 중요한 단정이다 — throw가 삼켜져
  // 발송이 0이 되는 증상은 로그로만 드러나므로, send 호출 여부를 직접 단정해야 한다.
  // ──────────────────────────────────────────────────────
  describe('F1 — 임베드 필드 생략 + 발송 보장', () => {
    it('T1-4(핵심 회귀) — 제목이 미션 줄로만 구성돼 전처리 후 빈 문자열이 되어도 channel.send가 호출되고 embed에 title 키가 없다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'EMBED',
          welcomeEmbedTitle: '{missionDurationDays}일 미션 시작!',
          missionEnabled: false,
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      // 수정 전 코드: setTitle('')이 discord.js validator에서 throw → catch가 삼켜
      // channel.send가 전혀 호출되지 않았다(F1 증상 그 자체). 이 단정이 재발을 잡는다.
      expect(send).toHaveBeenCalledTimes(1);
      const sentArg = send.mock.calls[0][0] as { embeds: Array<Record<string, unknown>> };
      expect(sentArg.embeds[0]).not.toHaveProperty('title');
    });

    it('T1-5 — 설명이 전부 미션 줄이면 발송되고 embed에 description 키가 없다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'EMBED',
          welcomeEmbedDescription: '{missionChannel}에서 확인하세요',
          missionEnabled: false,
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(send).toHaveBeenCalledTimes(1);
      const sentArg = send.mock.calls[0][0] as { embeds: Array<Record<string, unknown>> };
      expect(sentArg.embeds[0]).not.toHaveProperty('description');
    });

    it('T1-6 — 제목·설명 둘 다 빈 문자열로 줄어들면 발송되고 embed는 thumbnail만 보유한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'EMBED',
          welcomeEmbedTitle: '{missionDurationDays}일 미션 시작!',
          welcomeEmbedDescription: '{missionChannel}에서 확인하세요',
          missionEnabled: false,
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(send).toHaveBeenCalledTimes(1);
      const sentArg = send.mock.calls[0][0] as { embeds: Array<Record<string, unknown>> };
      const embed = sentArg.embeds[0];
      expect(embed).not.toHaveProperty('title');
      expect(embed).not.toHaveProperty('description');
      expect(embed).toHaveProperty('thumbnail');
    });

    it('T1-7 — welcomeContent 전체가 미션 줄이면 content는 undefined로 생략된다(빈 문자열 전송 금지)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'EMBED',
          welcomeContent: '{missionDurationDays}일 미션 시작!',
          missionEnabled: false,
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(send).toHaveBeenCalledTimes(1);
      const sentArg = send.mock.calls[0][0] as { content?: string };
      expect(sentArg.content).toBeUndefined();
    });

    it('T1-8 — CANVAS 경로에서 content가 전처리 후 빈 문자열이 되면 files로 정상 발송되고 content는 포함되지 않는다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
          welcomeContent: '{missionDurationDays}일 미션 시작!',
          missionEnabled: false,
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.getWelcomeCard).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
      const sentArg = send.mock.calls[0][0] as { files?: unknown[]; content?: string };
      expect(sentArg.files).toHaveLength(1);
      expect(sentArg.content).toBeUndefined();
    });

    it('T1-9(방어선 D) — 임베드 조립 중 setColor가 throw하면 경고 로그를 남기고 content만으로 발송한다', async () => {
      // private logger 로 나가는 경고를 단정해야 방어선 D 가 실제로 동작함을 고정할 수 있다
      const loggerHost = handler as unknown as { logger: { warn: (message: string) => void } };
      const loggerWarnSpy = vi.spyOn(loggerHost.logger, 'warn').mockImplementation(() => undefined);
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'EMBED',
          welcomeContent: '환영합니다!',
          // discord.js EmbedBuilder.setColor는 유효한 색상 형식이 아니면 throw한다
          // (`Unable to convert "..." to a number.`) — buildWelcomeEmbed 조립 실패 재현.
          welcomeEmbedColor: 'not-a-hex-color',
        }),
      );
      const send = vi.fn().mockResolvedValue(undefined);
      discordClient.channels.fetch.mockResolvedValue({ isTextBased: () => true, send });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(loggerWarnSpy).toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
      const sentArg = send.mock.calls[0][0] as { content?: string; embeds?: unknown[] };
      expect(sentArg.content).toBe('환영합니다!');
      expect(sentArg.embeds).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────
  // AUTO-ACTION 계측(F-USAGE-042) — welcome-sent / role-assigned
  // ──────────────────────────────────────────────────────
  describe('AUTO-ACTION 계측 — welcome-sent', () => {
    it('CANVAS 성공 시 welcome-sent 1회만 기록한다(EMBED 강등 이중 계상 없음)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      discordClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.recordAutoAction).toHaveBeenCalledTimes(1);
      expect(apiClient.recordAutoAction).toHaveBeenCalledWith({
        guildId: 'guild-1',
        domain: 'newbie',
        action: 'welcome-sent',
      });
    });

    it('CANVAS 실패 → EMBED 성공 시 welcome-sent 1회만 기록한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'CANVAS',
        }),
      );
      apiClient.getWelcomeCard.mockRejectedValue(new Error('API 500'));
      discordClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.recordAutoAction).toHaveBeenCalledTimes(1);
      expect(apiClient.recordAutoAction).toHaveBeenCalledWith({
        guildId: 'guild-1',
        domain: 'newbie',
        action: 'welcome-sent',
      });
    });

    it('완전 실패(channel.send throw) 시 0회 기록한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ welcomeEnabled: true, welcomeChannelId: 'ch-1', welcomeDisplayMode: 'EMBED' }),
      );
      discordClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        send: vi.fn().mockRejectedValue(new Error('Missing Permissions')),
      });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.recordAutoAction).not.toHaveBeenCalled();
    });

    it('recordAutoAction이 reject해도 핸들러가 정상 완료된다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({
          welcomeEnabled: true,
          welcomeChannelId: 'ch-1',
          welcomeDisplayMode: 'EMBED',
          roleEnabled: true,
          newbieRoleId: 'role-1',
        }),
      );
      apiClient.recordAutoAction.mockRejectedValue(new Error('bot-api down'));
      discordClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        send: vi.fn().mockResolvedValue(undefined),
      });
      const member = makeMember();

      await expect(handler.handleGuildMemberAdd(member)).resolves.toBeUndefined();
      expect(member.roles.add).toHaveBeenCalledWith('role-1');
    });
  });

  describe('AUTO-ACTION 계측 — role-assigned', () => {
    it('roles.add 성공 시 role-assigned 1회 기록한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.recordAutoAction).toHaveBeenCalledWith({
        guildId: 'guild-1',
        domain: 'newbie',
        action: 'role-assigned',
      });
    });

    it('roles.add 실패 시 0회 기록한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      const member = makeMember({
        roles: { add: vi.fn().mockRejectedValue(new Error('missing permission')) },
      });

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.recordAutoAction).not.toHaveBeenCalled();
    });

    it('notifyRoleAssigned(API 통보)가 실패해도 role-assigned 카운트는 취소되지 않는다(F-USAGE-042 — 판정 기준은 Discord 역할 부여 성공 여부)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      apiClient.notifyRoleAssigned.mockRejectedValue(new Error('NewbiePeriod 생성 실패'));
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.recordAutoAction).toHaveBeenCalledWith({
        guildId: 'guild-1',
        domain: 'newbie',
        action: 'role-assigned',
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // F-ADMIN-LOG-006 (계획 §2 P4) — 신입 온보딩 실패 관리 로그 게시.
  // 핵심 회귀: 역할은 정상 부여됐는데 notifyRoleAssigned(NewbiePeriod 생성)만 실패한 경우
  // "역할 부여 실패"로 오보되지 않아야 한다(isRoleAdded 가드).
  // ──────────────────────────────────────────────────────
  describe('F-ADMIN-LOG-006 — 신입 온보딩 실패 관리 로그 게시(P4)', () => {
    it('환영 메시지 전송(channel.send) 실패 시 kind: "welcome_message"로 1회 게시를 시도한다', async () => {
      // channels.fetch 실패는 내부에서 .catch(() => null)로 흡수돼 조용히 return하므로
      // (외부 catch에 도달하지 않는다), 실제로 outer catch를 타는 channel.send 실패를 쓴다
      // ("완전 실패(channel.send throw)" 테스트와 동형).
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ welcomeEnabled: true, welcomeChannelId: 'ch-1', welcomeDisplayMode: 'EMBED' }),
      );
      discordClient.channels.fetch.mockResolvedValue({
        isTextBased: () => true,
        send: vi.fn().mockRejectedValue(new Error('Missing Permissions')),
      });
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.recordNewbieOnboardingFailure).toHaveBeenCalledTimes(1);
      expect(apiClient.recordNewbieOnboardingFailure).toHaveBeenCalledWith({
        guildId: 'guild-1',
        memberId: 'member-1',
        kind: 'welcome_message',
      });
    });

    it('역할 부여(roles.add) 자체가 실패하면 kind: "role_assignment"로 1회 게시를 시도한다', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      const member = makeMember({
        roles: { add: vi.fn().mockRejectedValue(new Error('missing permission')) },
      });

      await handler.handleGuildMemberAdd(member);

      expect(apiClient.recordNewbieOnboardingFailure).toHaveBeenCalledTimes(1);
      expect(apiClient.recordNewbieOnboardingFailure).toHaveBeenCalledWith({
        guildId: 'guild-1',
        memberId: 'member-1',
        kind: 'role_assignment',
      });
    });

    it('핵심 회귀 — 역할은 정상 부여됐고 notifyRoleAssigned(API 통보)만 실패한 경우 recordNewbieOnboardingFailure를 호출하지 않는다(isRoleAdded 가드)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      apiClient.notifyRoleAssigned.mockRejectedValue(new Error('NewbiePeriod 생성 실패'));
      const member = makeMember();

      await handler.handleGuildMemberAdd(member);

      expect(member.roles.add).toHaveBeenCalledWith('role-1');
      expect(apiClient.recordNewbieOnboardingFailure).not.toHaveBeenCalled();
    });

    it('recordNewbieOnboardingFailure가 reject해도 handleGuildMemberAdd 자체는 예외 없이 완료된다(fire-and-forget)', async () => {
      apiClient.getNewbieConfig.mockResolvedValue(
        makeConfig({ roleEnabled: true, newbieRoleId: 'role-1' }),
      );
      apiClient.recordNewbieOnboardingFailure.mockRejectedValue(new Error('bot-api down'));
      const member = makeMember({
        roles: { add: vi.fn().mockRejectedValue(new Error('missing permission')) },
      });

      await expect(handler.handleGuildMemberAdd(member)).resolves.toBeUndefined();
      expect(apiClient.recordNewbieOnboardingFailure).toHaveBeenCalledTimes(1);
    });
  });
});
