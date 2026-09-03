/**
 * RankCommand 단위 테스트 — `/rank` 커맨드의 본인/타인 조회 분기(F-LVL-24/25, U9)를 검증한다.
 * `best-friend.command.spec.ts` 패턴(BotI18nService 실 로드 + 목 인터랙션) 준용.
 *
 * 핵심 회귀 가드(계획 §10 R4): 옵션은 **base 이름(`user`)**으로 조회해야 한다.
 * `getUser('유저')`처럼 한글 이름으로 조회하면 항상 null이 되어 타인 조회가 전부
 * "비멤버"로 오분류된다 — 아래 "양성 케이스"가 이를 감시한다.
 */
import type { BotApiClientService, LevelRankCardResponse } from '@onyu/bot-api-client';
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

describe('RankCommand', () => {
  let command: RankCommand;
  let apiClient: { getLevelRankCard: Mock };

  beforeEach(() => {
    apiClient = { getLevelRankCard: vi.fn().mockResolvedValue(rankCardResponse()) };

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
  });

  // ─── 본인 조회(무옵션) ────────────────────────────────────────────────────────

  it('무옵션이면 deferReply()를 인자 없이 호출하고(공개 응답) 본인 정보로 조회한다', async () => {
    const interaction = makeInteraction();

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(apiClient.getLevelRankCard).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: GUILD_ID, userId: USER_ID, displayName: 'Alice' }),
    );
  });

  // ─── §F2/R4 회귀 가드 — base 이름(user)으로 옵션을 조회한다 ──────────────────

  it('R4 회귀 가드: interaction.options.getUser가 base 이름("user")으로 호출된다', async () => {
    const interaction = makeInteraction();

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.options.getUser).toHaveBeenCalledWith('user');
  });

  it('타인 지정 시(멤버) API가 정상 호출된다(getMember도 base 이름 "user"로 조회 — 잘못된 이름이면 항상 null이 되어 이 테스트가 실패한다)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser('peer-1'), { displayName: '길드닉네임' }),
    });

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.options.getMember).toHaveBeenCalledWith('user');
    expect(apiClient.getLevelRankCard).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'peer-1', displayName: '길드닉네임' }),
    );
  });

  // ─── 타인 = 본인(EC-RANK-12) ─────────────────────────────────────────────────

  it('대상이 본인이면 본인 조회와 동일 경로로 처리한다(별도 분기 없음)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makeTargetUser(USER_ID), {}),
    });

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(apiClient.getLevelRankCard).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
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
  });

  // ─── 응답 분기 ────────────────────────────────────────────────────────────────

  it('데이터 없음(본인)이면 rankNoData 문구로 editReply한다', async () => {
    const interaction = makeInteraction();
    apiClient.getLevelRankCard.mockResolvedValue(rankCardResponse({ data: null }));

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '아직 활동 XP가 없습니다. 음성·채팅 활동을 하면 순위가 표시됩니다.',
    });
  });

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

  it('렌더 실패(ok:false)이면 rankError 문구로 editReply한다(5xx 아님, 200+ok:false 폴백)', async () => {
    const interaction = makeInteraction();
    apiClient.getLevelRankCard.mockResolvedValue(rankCardResponse({ ok: false, data: null }));

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '랭크 카드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });

  it('정상 응답이면 PNG 첨부(rank.png)로 editReply한다', async () => {
    const interaction = makeInteraction();

    await command.onRank(interaction, new RankCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      files: Array<{ name: string }>;
    };
    expect(call.files).toHaveLength(1);
    expect(call.files[0].name).toBe('rank.png');
  });

  it('API 호출이 reject되면(예외) catch 경로에서 rankError 문구로 editReply한다', async () => {
    const interaction = makeInteraction();
    apiClient.getLevelRankCard.mockRejectedValue(new Error('network fail'));

    await command.onRank(interaction, new RankCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '랭크 카드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });
});
