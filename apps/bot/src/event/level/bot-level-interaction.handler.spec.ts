/**
 * BotLevelInteractionHandler 단위 테스트 — `/랭킹` 보드 카드의 [이전]/[다음] 버튼
 * interactionCreate 이벤트 처리(S7, F-LVL-26)를 검증한다.
 * `bot-newbie-interaction.handler.spec.ts`/`bot-me-interaction.handler.spec.ts` 패턴 준용.
 */
import type { BotApiClientService, LevelLeaderboardCardResponse } from '@onyu/bot-api-client';
import type { ButtonInteraction, Interaction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BotLevelInteractionHandler } from './bot-level-interaction.handler';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

function makeButtonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  const interaction = {
    isButton: () => true,
    customId: 'rank:next:guild-1:1',
    user: { id: USER_ID },
    guildId: GUILD_ID,
    locale: 'ko',
    // 실제 discord.js에서는 deferUpdate() 호출 후 deferred가 true로 바뀐다 — 아래에서 재현한다.
    deferred: false,
    replied: false,
    deferUpdate: vi.fn(),
    followUp: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    message: { edit: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  } as unknown as ButtonInteraction & { deferred: boolean };

  (interaction.deferUpdate as Mock).mockImplementation(() => {
    interaction.deferred = true;
    return Promise.resolve(undefined);
  });

  return interaction;
}

function leaderboardCardResponse(
  overrides: Partial<LevelLeaderboardCardResponse> = {},
): LevelLeaderboardCardResponse {
  return {
    ok: true,
    data: { imageBase64: Buffer.from('leaderboard-png').toString('base64') },
    isEnabled: true,
    page: 2,
    totalPages: 3,
    total: 25,
    ...overrides,
  };
}

describe('BotLevelInteractionHandler', () => {
  let handler: BotLevelInteractionHandler;
  let apiClient: { getLevelLeaderboardCard: Mock };

  beforeEach(() => {
    apiClient = {
      getLevelLeaderboardCard: vi.fn().mockResolvedValue(leaderboardCardResponse()),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    handler = new BotLevelInteractionHandler(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  // ─── 공통 필터링 ─────────────────────────────────────────────────────────────

  it('버튼이 아닌 인터랙션은 무시한다', async () => {
    const interaction = { isButton: () => false } as unknown as Interaction;

    await handler.handle(interaction);

    expect(apiClient.getLevelLeaderboardCard).not.toHaveBeenCalled();
  });

  it('rank:prev/rank:next 접두사가 아닌 customId는 무시한다(다른 핸들러와 공존)', async () => {
    const interaction = makeButtonInteraction({ customId: 'me:leaderboard' });

    await handler.handle(interaction);

    expect(apiClient.getLevelLeaderboardCard).not.toHaveBeenCalled();
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
  });

  it('DM(guildId 없음)이면 무시한다(방어)', async () => {
    const interaction = makeButtonInteraction({ guildId: null });

    await handler.handle(interaction);

    expect(interaction.deferUpdate).not.toHaveBeenCalled();
  });

  // ─── customId 파싱 ───────────────────────────────────────────────────────────

  it('rank:next:{guildId}:{page} 파싱 후 다음 페이지(currentPage+1)로 조회한다', async () => {
    const interaction = makeButtonInteraction({ customId: 'rank:next:guild-9:2' });

    await handler.handle(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(apiClient.getLevelLeaderboardCard).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-9', page: 3 }),
    );
  });

  it('rank:prev:{guildId}:{page} 파싱 후 이전 페이지(currentPage-1)로 조회한다', async () => {
    const interaction = makeButtonInteraction({ customId: 'rank:prev:guild-9:2' });

    await handler.handle(interaction);

    expect(apiClient.getLevelLeaderboardCard).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-9', page: 1 }),
    );
  });

  // ─── 정상 응답 — 메시지 갱신 + 버튼 재조립 ────────────────────────────────────

  it('정상 응답이면 원본 메시지를 새 이미지 + 갱신된 버튼 행으로 edit한다(새 메시지 추가 없음)', async () => {
    const interaction = makeButtonInteraction();

    await handler.handle(interaction);

    const call = (interaction.message.edit as Mock).mock.calls[0][0] as {
      files: Array<{ name: string }>;
      components: Array<{ components: Array<{ toJSON: () => { disabled: boolean } }> }>;
      content: string;
      embeds: unknown[];
    };
    expect(call.files).toHaveLength(1);
    expect(call.files[0].name).toBe('leaderboard.png');
    expect(call.content).toBe('');
    expect(call.embeds).toEqual([]);
    expect(call.components).toHaveLength(1);
    // 중간 페이지(2/3)이므로 이전/다음 버튼 둘 다 활성 상태를 유지해야 한다
    const [prevButton, nextButton] = call.components[0].components.map((b) => b.toJSON());
    expect(prevButton.disabled).toBe(false);
    expect(nextButton.disabled).toBe(false);
  });

  it('마지막 페이지에 도달하면 다음 버튼은 비활성화되고 이전 버튼은 활성 상태를 유지한다', async () => {
    const interaction = makeButtonInteraction();
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ page: 3, totalPages: 3 }),
    );

    await handler.handle(interaction);

    const call = (interaction.message.edit as Mock).mock.calls[0][0] as {
      components: Array<{ components: Array<{ toJSON: () => { disabled: boolean } }> }>;
    };
    const [prevButton, nextButton] = call.components[0].components.map((b) => b.toJSON());
    expect(nextButton.disabled).toBe(true);
    expect(prevButton.disabled).toBe(false);
  });

  it('첫 페이지로 돌아오면 이전 버튼은 비활성화되고 다음 버튼은 활성 상태를 유지한다', async () => {
    const interaction = makeButtonInteraction({ customId: 'rank:prev:guild-1:2' });
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ page: 1, totalPages: 3 }),
    );

    await handler.handle(interaction);

    const call = (interaction.message.edit as Mock).mock.calls[0][0] as {
      components: Array<{ components: Array<{ toJSON: () => { disabled: boolean } }> }>;
    };
    const [prevButton, nextButton] = call.components[0].components.map((b) => b.toJSON());
    expect(prevButton.disabled).toBe(true);
    expect(nextButton.disabled).toBe(false);
  });

  // ─── 빈 상태 전환 — 텍스트로 교체 + 버튼 제거 ─────────────────────────────────

  it('isEnabled=false로 전환되면 텍스트 안내로 edit하고 버튼을 제거한다(components: [])', async () => {
    const interaction = makeButtonInteraction();
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ isEnabled: false, data: null }),
    );

    await handler.handle(interaction);

    expect(interaction.message.edit).toHaveBeenCalledWith({
      content: '이 서버는 레벨 시스템이 꺼져 있습니다.',
      embeds: [],
      files: [],
      components: [],
    });
  });

  it('범위 초과로 전환되면(total>0, data:null) leaderboardOutOfRange 안내로 edit하고 버튼을 제거한다', async () => {
    const interaction = makeButtonInteraction();
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ data: null, total: 25 }),
    );

    await handler.handle(interaction);

    expect(interaction.message.edit).toHaveBeenCalledWith({
      content: '해당 페이지에는 결과가 없습니다.',
      embeds: [],
      files: [],
      components: [],
    });
  });

  it('렌더 실패(ok:false, 5xx 아닌 일시 장애)이면 채널 메시지는 건드리지 않고 클릭한 사용자에게만 ephemeral 안내한다', async () => {
    const interaction = makeButtonInteraction();
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ ok: false, data: null }),
    );

    await handler.handle(interaction);

    expect(interaction.message.edit).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      ephemeral: true,
      content: '서버 랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('로케일이 en으로 해석되면 ephemeral 안내 문구도 영어로 전송한다', async () => {
    const interaction = makeButtonInteraction({ locale: 'en-US' });
    apiClient.getLevelLeaderboardCard.mockResolvedValue(
      leaderboardCardResponse({ ok: false, data: null }),
    );

    await handler.handle(interaction);

    expect(interaction.message.edit).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      ephemeral: true,
      content: "Couldn't load the server leaderboard. Please try again later.",
    });
  });

  // ─── 만료된 인터랙션(EC-RANK-24) / API 예외 ───────────────────────────────────

  it('API 호출이 reject되면(만료된 인터랙션 등) 채널 메시지는 건드리지 않고 ephemeral 안내를 시도하며 예외를 던지지 않는다', async () => {
    const interaction = makeButtonInteraction();
    apiClient.getLevelLeaderboardCard.mockRejectedValue(new Error('Unknown interaction'));

    await expect(handler.handle(interaction)).resolves.toBeUndefined();

    expect(interaction.message.edit).not.toHaveBeenCalled();
    // deferUpdate()가 먼저 성공했으므로(deferred=true) followUp 경로를 탄다.
    expect(interaction.followUp).toHaveBeenCalledWith({
      ephemeral: true,
      content: '서버 랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
  });

  it('deferUpdate() 이전에 예외가 발생하면(미ack 상태) reply()로 ephemeral 안내한다', async () => {
    const interaction = makeButtonInteraction();
    (interaction.deferUpdate as Mock).mockRejectedValue(new Error('Unknown interaction'));

    await expect(handler.handle(interaction)).resolves.toBeUndefined();

    expect(interaction.message.edit).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      ephemeral: true,
      content: '서버 랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    });
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('ephemeral 안내 전송 자체도 실패하면 조용히 로그만 남기고 예외를 던지지 않으며 채널 메시지도 건드리지 않는다', async () => {
    const interaction = makeButtonInteraction();
    apiClient.getLevelLeaderboardCard.mockRejectedValue(new Error('Unknown interaction'));
    (interaction.followUp as Mock).mockRejectedValue(new Error('Unknown interaction'));

    await expect(handler.handle(interaction)).resolves.toBeUndefined();

    expect(interaction.message.edit).not.toHaveBeenCalled();
  });

  // ─── customId 파싱 ───────────────────────────────────────────────────────────

  it('customId에 페이지 번호가 없는 등 파싱이 어긋나도 예외를 던지지 않고 API를 호출한다(방어 검증 없음)', async () => {
    // 'rank:next:' 접두어 이후 콜론이 없는 형태 — lastIndexOf(':')가 -1을 반환해
    // guildId/page 파싱이 어긋난다(정상적으로는 봇 자신이 생성한 customId만 수신하므로
    // 발생하지 않지만, 방어적으로 예외 없이 처리되는지 확인한다).
    const interaction = makeButtonInteraction({ customId: 'rank:next:guild-1' });

    await expect(handler.handle(interaction)).resolves.toBeUndefined();

    expect(apiClient.getLevelLeaderboardCard).toHaveBeenCalledTimes(1);
    const call = apiClient.getLevelLeaderboardCard.mock.calls[0][0] as { page: number };
    expect(call.page).toBeNaN();
  });
});
