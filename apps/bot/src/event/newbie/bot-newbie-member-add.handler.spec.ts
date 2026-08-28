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
});
