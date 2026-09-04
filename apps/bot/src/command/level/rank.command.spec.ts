/**
 * RankCommand 단위 테스트 — `/rank` 커맨드의 본인/타인 조회 분기(F-LVL-24/25, U9)를 검증한다.
 * `best-friend.command.spec.ts` 패턴(BotI18nService 실 로드 + 목 인터랙션) 준용.
 *
 * 핵심 회귀 가드(계획 §10 R4): 옵션은 **base 이름(`user`)**으로 조회해야 한다.
 * `getUser('유저')`처럼 한글 이름으로 조회하면 항상 null이 되어 타인 조회가 전부
 * "비멤버"로 오분류된다 — 아래 "양성 케이스"가 이를 감시한다.
 *
 * U9-b(F-LVL-25, plan me-card-alias.md §8 R/R-N) — 본인 경로는 `/me`와 동일한
 * `getMeProfile`(→ `fetchMeProfileCard`) 경로를 타며 `getLevelRankCard`는 호출하지 않는다.
 * 타인 경로는 `getLevelRankCard`를 그대로 사용한다(D5, 무변경).
 */
import type {
  BotApiClientService,
  LevelRankCardResponse,
  MeProfileResponse,
} from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { RankCommand } from './rank.command';
import { RankCommandDto } from './rank.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

function makeOptions(
  user: User | null,
  memberOverride: Record<string, unknown> | null = user ? {} : null,
): { getUser: Mock; getMember: Mock; getInteger: Mock } {
  return {
    getUser: vi.fn((name: string) => (name === 'user' ? user : null)),
    getMember: vi.fn((name: string) => (name === 'user' ? memberOverride : null)),
    getInteger: vi.fn().mockReturnValue(null),
  };
}

function makeTargetUser(id: string, overrides: Record<string, unknown> = {}): User {
  return {
    id,
    bot: false,
    displayName: `target-${id}`,
    displayAvatarURL: () => `https://cdn/target-${id}.png`,
    ...overrides,
  } as unknown as User;
}

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'ko',
    user: { id: USER_ID, displayName: 'Alice', displayAvatarURL: () => 'https://cdn/avatar.png' },
    member: { displayName: 'Alice' } as unknown as GuildMember,
    options: makeOptions(null),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function rankCardResponse(overrides: Partial<LevelRankCardResponse> = {}): LevelRankCardResponse {
  return {
    ok: true,
    data: { imageBase64: Buffer.from('rank-png').toString('base64') },
    ...overrides,
  };
}

/** me.command.spec.ts의 profileResponse()와 동형(D5 — /rank 본인 경로가 /me와 같은 응답 셰이프를 소비) */
function profileResponse(overrides: Partial<MeProfileResponse> = {}): MeProfileResponse {
  return {
    ok: true,
    days: 15,
    data: { imageBase64: Buffer.from('png').toString('base64') },
    ...overrides,
  };
}

describe('RankCommand', () => {
  let command: RankCommand;
  let apiClient: { getLevelRankCard: Mock; getMeProfile: Mock };

  beforeEach(() => {
    apiClient = {
      getLevelRankCard: vi.fn().mockResolvedValue(rankCardResponse()),
      getMeProfile: vi.fn().mockResolvedValue(profileResponse()),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new RankCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  // ─── 길드 밖(DM) ─────────────────────────────────────────────────────────────

  it('길드 밖(DM)이면 errors.guildOnly 안내 후 API를 호출하지 않는다', async () => {
    const interaction = makeInteraction({ guildId: null });

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '서버에서만 사용 가능한 명령어입니다.',
      ephemeral: true,
    });
    expect(apiClient.getLevelRankCard).not.toHaveBeenCalled();
    expect(apiClient.getMeProfile).not.toHaveBeenCalled();
  });

  // ─── 본인 조회(무옵션) — U9-b: /me 프로필 카드 경로 ──────────────────────────

  it('무옵션이면 deferReply()를 인자 없이 호출하고(공개 응답) getMeProfile로 본인 정보를 조회한다(getLevelRankCard는 미호출)', async () => {
    const interaction = makeInteraction();

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(apiClient.getMeProfile).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: GUILD_ID, userId: USER_ID, displayName: 'Alice' }),
    );
    expect(apiClient.getLevelRankCard).not.toHaveBeenCalled();
  });

  // ─── §F2/R4 회귀 가드 — base 이름(user)으로 옵션을 조회한다 ──────────────────

  it('R4 회귀 가드: interaction.options.getUser가 base 이름("user")으로 호출된다', async () => {
    const interaction = makeInteraction();

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.options.getUser).toHaveBeenCalledWith('user');
  });

  it('타인 지정 시(멤버) getLevelRankCard가 정상 호출되고 PNG 첨부(rank.png)로 응답한다(getMember도 base 이름 "user"로 조회 — 잘못된 이름이면 항상 null이 되어 이 테스트가 실패한다)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser('peer-1'), { displayName: '길드닉네임' }),
    });

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.options.getMember).toHaveBeenCalledWith('user');
    expect(apiClient.getLevelRankCard).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'peer-1', displayName: '길드닉네임' }),
    );
    expect(apiClient.getMeProfile).not.toHaveBeenCalled();

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      files: Array<{ name: string }>;
    };
    expect(call.files).toHaveLength(1);
    expect(call.files[0].name).toBe('rank.png');
  });

  // ─── 타인 = 본인(EC-RANK-12) — U9-b: 명시 지정도 본인 프로필 카드 경로 ───────

  it('대상이 본인이면 본인 조회와 동일 경로(getMeProfile)로 처리한다(별도 분기 없음)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser(USER_ID), {}),
    });

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(apiClient.getMeProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
    expect(apiClient.getLevelRankCard).not.toHaveBeenCalled();
  });

  // ─── 타인 = 봇(EC-RANK-10) ────────────────────────────────────────────────────

  it('대상이 봇이면 ephemeral 안내만 하고 API를 호출하지 않는다(EC-RANK-10)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser('bot-1', { bot: true }), {}),
    });

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '봇 계정은 조회할 수 없습니다.',
      ephemeral: true,
    });
    expect(apiClient.getLevelRankCard).not.toHaveBeenCalled();
    expect(apiClient.getMeProfile).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // ─── 타인 = 비멤버(EC-RANK-11) ────────────────────────────────────────────────

  it('대상이 서버 비멤버(getMember 없음)이면 ephemeral 안내만 하고 API를 호출하지 않는다(EC-RANK-11)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser('peer-1'), null),
    });

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '이 서버의 멤버만 조회할 수 있습니다.',
      ephemeral: true,
    });
    expect(apiClient.getLevelRankCard).not.toHaveBeenCalled();
    expect(apiClient.getMeProfile).not.toHaveBeenCalled();
  });

  // ─── 응답 분기(본인) — U9-b: /me와 동일한 meNoActivity{days} 문구 승계(D3) ────

  it('데이터 없음(본인)이면 getMeProfile의 data:null → meNoActivity{days} 문구로 editReply한다(rankNoData는 더 이상 쓰이지 않는다)', async () => {
    const interaction = makeInteraction();
    apiClient.getMeProfile.mockResolvedValue(profileResponse({ data: null, days: 15 }));

    await command.onRank(interaction, new RankCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as { content: string };
    expect(call.content).toBe('최근 15일간 음성 채널 활동 기록이 없습니다.');
  });

  // ─── 응답 분기(타인) — D5 무변경 ──────────────────────────────────────────────

  it('데이터 없음(타인)이면 rankNoDataOther 문구로 editReply한다(사유 미구분이나 대상 구분은 한다)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser('peer-1'), {}),
    });
    apiClient.getLevelRankCard.mockResolvedValue(rankCardResponse({ data: null }));

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '해당 유저는 아직 활동 XP가 없습니다.',
    });
  });

  // ─── 렌더 실패(ok:false) ──────────────────────────────────────────────────────

  it('본인 경로에서 렌더 실패(ok:false)이면 rankError 문구로 editReply한다(D3 — /me와 달리 ok 가드를 둔다)', async () => {
    const interaction = makeInteraction();
    apiClient.getMeProfile.mockResolvedValue(profileResponse({ ok: false, data: null }));

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '랭크 카드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });

  it('타인 경로에서 렌더 실패(ok:false)이면 rankError 문구로 editReply한다(5xx 아님, 200+ok:false 폴백, D5 무변경)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser('peer-1'), {}),
    });
    apiClient.getLevelRankCard.mockResolvedValue(rankCardResponse({ ok: false, data: null }));

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '랭크 카드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });

  // ─── 예외(reject) — 본인/타인 각 1건(D3) ─────────────────────────────────────

  it('본인 경로에서 API 호출이 reject되면(예외) catch 경로에서 rankError 문구로 editReply한다', async () => {
    const interaction = makeInteraction();
    apiClient.getMeProfile.mockRejectedValue(new Error('network fail'));

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '랭크 카드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });

  it('타인 경로에서 API 호출이 reject되면(예외) catch 경로에서 rankError 문구로 editReply한다', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser('peer-1'), {}),
    });
    apiClient.getLevelRankCard.mockRejectedValue(new Error('network fail'));

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '랭크 카드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });

  // ─── D2 — 캐시·쿼터 회귀 가드 ─────────────────────────────────────────────────

  describe('U9-b 본인 경로 — D2/D4 회귀 가드', () => {
    it('R-N1: 본인 경로 호출 인자에 viewOption 키가 존재하지 않는다(D2 — /me와 캐시 키를 공유하기 위함)', async () => {
      const interaction = makeInteraction();

      await command.onRank(interaction, new RankCommandDto());

      const options = apiClient.getMeProfile.mock.calls[0][0] as Record<string, unknown>;
      expect(options).not.toHaveProperty('viewOption');
    });

    it("R-N2: 본인 경로 호출 인자에 mentType:'analysis'가 포함된다", async () => {
      const interaction = makeInteraction();

      await command.onRank(interaction, new RankCommandDto());

      expect(apiClient.getMeProfile).toHaveBeenCalledWith(
        expect.objectContaining({ mentType: 'analysis' }),
      );
    });

    it('R-N3: 본인 경로 정상 응답의 첨부 파일명이 profile.png다', async () => {
      const interaction = makeInteraction();

      await command.onRank(interaction, new RankCommandDto());

      const call = (interaction.editReply as Mock).mock.calls[0][0] as {
        files: Array<{ name: string }>;
      };
      expect(call.files).toHaveLength(1);
      expect(call.files[0].name).toBe('profile.png');
    });

    it('R-N4: 본인 경로 정상 응답에 /me와 동일한 버튼 3종이 붙는다(D4)', async () => {
      const interaction = makeInteraction();

      await command.onRank(interaction, new RankCommandDto());

      const call = (interaction.editReply as Mock).mock.calls[0][0] as {
        components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
      };
      const buttons = call.components[0].components.map((b) => b.toJSON());
      expect(buttons).toHaveLength(3);
      expect(buttons[1]).toMatchObject({ custom_id: 'me:leaderboard' });
      expect(buttons[2]).toMatchObject({ custom_id: 'me:activity_detail' });
    });

    it('R-N5: 본인 경로 활동 없음 응답에는 대시보드 링크 버튼 1개만 붙는다(D4)', async () => {
      const interaction = makeInteraction();
      apiClient.getMeProfile.mockResolvedValue(profileResponse({ data: null, days: 15 }));

      await command.onRank(interaction, new RankCommandDto());

      const call = (interaction.editReply as Mock).mock.calls[0][0] as {
        components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
      };
      const buttons = call.components[0].components.map((b) => b.toJSON());
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).not.toHaveProperty('custom_id');
    });
  });
});
