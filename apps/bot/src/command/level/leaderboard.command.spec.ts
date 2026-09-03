/**
 * LeaderboardCommand 단위 테스트 — `/랭킹` 커맨드의 폴백 4분기·버튼 부착 여부(F-LVL-26, U9)를
 * 검증한다. `best-friend.command.spec.ts`/`rank.command.spec.ts` 패턴 준용.
 */
import type { BotApiClientService, LevelLeaderboardCardResponse } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { LeaderboardCommand } from './leaderboard.command';
import { LeaderboardCommandDto } from './leaderboard.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

function makeOptions(page: number | null = null): { getInteger: Mock } {
  return { getInteger: vi.fn((name: string) => (name === 'page' ? page : null)) };
}

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'ko',
    user: { id: USER_ID },
    options: makeOptions(),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function leaderboardCardResponse(
  overrides: Partial<LevelLeaderboardCardResponse> = {},
): LevelLeaderboardCardResponse {
  return {
    ok: true,
    data: { imageBase64: Buffer.from('leaderboard-png').toString('base64') },
    isEnabled: true,
    page: 1,
    totalPages: 3,
    total: 25,
    ...overrides,
  };
}

describe('LeaderboardCommand', () => {
  let command: LeaderboardCommand;
  let apiClient: { getLevelLeaderboardCard: Mock };

  beforeEach(() => {
    apiClient = {
      getLevelLeaderboardCard: vi.fn().mockResolvedValue(leaderboardCardResponse()),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new LeaderboardCommand(
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

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '서버에서만 사용 가능한 명령어입니다.',
      ephemeral: true,
    });
    expect(apiClient.getLevelLeaderboardCard).not.toHaveBeenCalled();
  });

  // ─── 옵션 조회(F2/base 이름) ──────────────────────────────────────────────────

  it('옵션 없으면 deferReply()를 인자 없이 호출하고(공개) page=1, limit=10, viewerUserId로 조회한다', async () => {
    const interaction = makeInteraction();

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(interaction.options.getInteger).toHaveBeenCalledWith('page');
    expect(apiClient.getLevelLeaderboardCard).toHaveBeenCalledWith({
      guildId: GUILD_ID,
      page: 1,
      limit: 10,
      viewerUserId: USER_ID,
      locale: 'ko',
    });
  });

  it('page 옵션이 지정되면 그 값으로 조회한다', async () => {
    const interaction = makeInteraction({ options: makeOptions(3) });

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    expect(apiClient.getLevelLeaderboardCard).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3 }),
    );
  });

  // ─── 정상 응답 — PNG + 버튼 부착 ──────────────────────────────────────────────

  it('정상 응답이면 PNG 첨부(leaderboard.png) + 이전/다음 버튼 행을 포함해 editReply한다', async () => {
    const interaction = makeInteraction();

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      files: Array<{ name: string }>;
      components: Array<{ components: unknown[] }>;
    };
    expect(call.files).toHaveLength(1);
    expect(call.files[0].name).toBe('leaderboard.png');
    expect(call.components).toHaveLength(1);
    expect(call.components[0].components).toHaveLength(2); // [이전][다음]
  });

  // ─── 폴백 4분기(버튼 미부착) ──────────────────────────────────────────────────

  it('isEnabled=false이면 leaderboardDisabled 문구만 표시하고 버튼을 붙이지 않는다', async () => {
    const interaction = makeInteraction();
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ isEnabled: false, data: null }),
    );

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '이 서버는 레벨 시스템이 꺼져 있습니다.',
    });
  });

  it('활동 0명(total=0, data:null)이면 leaderboardEmpty 문구만 표시한다', async () => {
    const interaction = makeInteraction();
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ data: null, total: 0 }),
    );

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '아직 순위에 오른 멤버가 없습니다.',
    });
  });

  it('범위 초과 페이지(total>0, data:null)이면 leaderboardOutOfRange 문구만 표시한다(activityEmpty와 다른 문구)', async () => {
    const interaction = makeInteraction({ options: makeOptions(999) });
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ data: null, total: 25, page: 999 }),
    );

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '해당 페이지에는 결과가 없습니다.',
    });
  });

  it('렌더 실패(ok:false)이면 leaderboardError 문구만 표시한다(5xx 아님)', async () => {
    const interaction = makeInteraction();
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ ok: false, data: null }),
    );

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '서버 랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });

  it('API 호출이 reject되면(예외) catch 경로에서 leaderboardError 문구로 editReply한다', async () => {
    const interaction = makeInteraction();
    apiClient.getLevelLeaderboardCard.mockRejectedValue(new Error('network fail'));

    await command.onLeaderboard(interaction, new LeaderboardCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '서버 랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });
});
