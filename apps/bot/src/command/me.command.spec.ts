/**
 * MeCommand 단위 테스트 — `/미` 커맨드의 `getMeProfile` 배선을 검증한다(F-VOICE-082, R3 T12).
 * `bot-me-interaction.handler.spec.ts` 패턴(BotI18nService 실 로드 + 목 인터랙션) 준용.
 * `apps/bot/src/command/`에 spec 파일이 없어(실측) 본 파일이 최초 신규 파일이다.
 */
import type { BotApiClientService, MeProfileResponse } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { MeCommand } from './me.command';
import { MeCommandDto, MeViewOption } from './me.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'ko',
    user: { id: USER_ID, displayName: 'Alice', displayAvatarURL: () => 'https://cdn/avatar.png' },
    member: { displayName: 'Alice' } as unknown as GuildMember,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function profileResponse(overrides: Partial<MeProfileResponse> = {}): MeProfileResponse {
  return {
    ok: true,
    days: 15,
    data: { imageBase64: Buffer.from('png').toString('base64') },
    ...overrides,
  };
}

describe('MeCommand', () => {
  let command: MeCommand;
  let apiClient: { getMeProfile: Mock };

  beforeEach(() => {
    apiClient = { getMeProfile: vi.fn().mockResolvedValue(profileResponse()) };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new MeCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      // CM-5 — LocaleResolverService 가 BotApiClientService 를 DI 받도록 확장됨(F-GENERAL-005).
      // `{ locale: null }` 을 반환시켜 리졸버가 2순위(interaction.locale)로 폴백하게 하여
      // 기존 기대값을 그대로 유지한다.
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  it('LocaleResolverService.resolve 결과를 getMeProfile options.locale로 전달한다(ko)', async () => {
    const interaction = makeInteraction({ locale: 'ko' });

    await command.onMe(interaction, new MeCommandDto());

    expect(apiClient.getMeProfile).toHaveBeenCalledWith(expect.objectContaining({ locale: 'ko' }));
  });

  it("지원하지 않는 인터랙션 locale은 'en'으로 안전 변환되어 전달된다", async () => {
    const interaction = makeInteraction({ locale: 'fr' });

    await command.onMe(interaction, new MeCommandDto());

    expect(apiClient.getMeProfile).toHaveBeenCalledWith(expect.objectContaining({ locale: 'en' }));
  });

  it('subtitleTemplate 필드를 더 이상 전송하지 않는다(F-VOICE-082 — CARD_STRINGS로 이관)', async () => {
    const interaction = makeInteraction();

    await command.onMe(interaction, new MeCommandDto());

    const options = apiClient.getMeProfile.mock.calls[0][0] as Record<string, unknown>;
    expect(options).not.toHaveProperty('subtitleTemplate');
  });

  it("dto.view='voice' 지정 시 options.viewOption='voice'로 전달된다(F-VOICE-066)", async () => {
    const interaction = makeInteraction();
    const dto = new MeCommandDto();
    dto.view = MeViewOption.Voice;

    await command.onMe(interaction, dto);

    expect(apiClient.getMeProfile).toHaveBeenCalledWith(
      expect.objectContaining({ viewOption: 'voice' }),
    );
  });

  it('dto.view 미지정 시 options.viewOption은 undefined이다(기본 레이아웃 A)', async () => {
    const interaction = makeInteraction();

    await command.onMe(interaction, new MeCommandDto());

    expect(apiClient.getMeProfile).toHaveBeenCalledWith(
      expect.objectContaining({ viewOption: undefined }),
    );
  });

  it('guildId/userId/displayName/avatarUrl을 인터랙션에서 조합해 전달한다', async () => {
    const interaction = makeInteraction();

    await command.onMe(interaction, new MeCommandDto());

    expect(apiClient.getMeProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: GUILD_ID,
        userId: USER_ID,
        displayName: 'Alice',
        avatarUrl: 'https://cdn/avatar.png',
      }),
    );
  });

  // ──────────────────────────────────────────────────────
  // /미 멘트 자동 요청 — F-VOICE-079 후속 개정(2026-07-30)
  // ──────────────────────────────────────────────────────
  describe('멘트 자동 요청(F-VOICE-079 후속 개정)', () => {
    it("옵션 없는 new MeCommandDto() 실행에서 getMeProfile이 mentType:'analysis'로 호출된다", async () => {
      const interaction = makeInteraction();

      await command.onMe(interaction, new MeCommandDto());

      expect(apiClient.getMeProfile).toHaveBeenCalledWith(
        expect.objectContaining({ mentType: 'analysis' }),
      );
    });

    it('dto.view=voice(레이아웃 B)에서도 mentType:analysis가 그대로 전달된다(봇은 판정하지 않는다, A1) — 실제 스킵은 API D6 가드(bot-me.controller.spec.ts 동명 테스트)가 검증한다', async () => {
      const interaction = makeInteraction();
      const dto = new MeCommandDto();
      dto.view = MeViewOption.Voice;

      await command.onMe(interaction, dto);

      expect(apiClient.getMeProfile).toHaveBeenCalledWith(
        expect.objectContaining({ viewOption: 'voice', mentType: 'analysis' }),
      );
    });
  });

  it('길드 밖(DM)에서는 getMeProfile을 호출하지 않는다', async () => {
    const interaction = makeInteraction({ guildId: null });

    await command.onMe(interaction, new MeCommandDto());

    expect(apiClient.getMeProfile).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('API HTTP 요청이 실패하면 catch 후 일반 오류 안내(meError)를 표시하고 예외를 전파하지 않는다(EC-CARD-13)', async () => {
    apiClient.getMeProfile.mockRejectedValue(new Error('network down'));
    const interaction = makeInteraction();

    await expect(command.onMe(interaction, new MeCommandDto())).resolves.toBeUndefined();

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '프로필 조회 중 오류가 발생했습니다.',
    });
  });

  it('활동 데이터가 있으면(data 존재) 대시보드 링크·서버 리더보드·활동 상세 버튼 3종을 표시한다(F-VOICE-064/065)', async () => {
    const interaction = makeInteraction();

    await command.onMe(interaction, new MeCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
    };
    const buttons = call.components[0].components.map((b) => b.toJSON());
    expect(buttons).toHaveLength(3);
    expect(buttons[1]).toMatchObject({ custom_id: 'me:leaderboard' });
    expect(buttons[2]).toMatchObject({ custom_id: 'me:activity_detail' });
  });

  it('활동 데이터가 없으면(data:null) days 파라미터화 안내 텍스트 + 대시보드 링크 버튼만 표시한다(EC-CARD-20)', async () => {
    apiClient.getMeProfile.mockResolvedValue(profileResponse({ data: null, days: 15 }));
    const interaction = makeInteraction();

    await command.onMe(interaction, new MeCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      content: string;
      components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
    };
    expect(call.content).toBe('최근 15일간 음성 채널 활동 기록이 없습니다.');
    const buttons = call.components[0].components.map((b) => b.toJSON());
    expect(buttons).toHaveLength(1); // 대시보드 링크 버튼만 — 리더보드/활동 상세 버튼 미첨부
    expect(buttons[0]).not.toHaveProperty('custom_id'); // Link 스타일 버튼은 customId가 아니라 url을 가진다
  });
});
