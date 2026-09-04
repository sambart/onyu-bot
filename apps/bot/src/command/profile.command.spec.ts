/**
 * ProfileCommand 단위 테스트 — `/profile`(`/프로필`) 별칭 커맨드의 등록 정합성과 DI 안전성을
 * 검증한다(F-VOICE-123, plan me-card-alias.md §8 T1~T4).
 *
 * `'__command_decorator__'`는 `@discord-nestjs/core`가 패키지 index에서 공개 export하지
 * 않는 내부 상수 값이다(`command.constant.js` 실측) — 여기서는 실측값을 문자열 리터럴로
 * 고정해 회귀를 감시한다.
 */
import 'reflect-metadata';

import type { BotApiClientService } from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../common/application/bot-i18n.service';
import { LocaleResolverService } from '../common/application/locale-resolver.service';
import { MeCommand } from './me.command';
import { MeCommandDto, MeViewOption } from './me.dto';
import { ProfileCommand } from './profile.command';

const COMMAND_DECORATOR_KEY = '__command_decorator__';

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

describe('ProfileCommand', () => {
  it('T1 — 프로토타입 메타데이터가 profile로 재선언되어 있다(상속으로 me가 새어나오지 않음)', () => {
    const options = Reflect.getMetadata(COMMAND_DECORATOR_KEY, ProfileCommand.prototype) as {
      name: string;
      nameLocalizations?: Record<string, string>;
    };

    expect(options.name).toBe('profile');
    expect(options.nameLocalizations?.['ko']).toBe('프로필');
  });

  it('T2 — MeCommand.prototype의 메타데이터는 오염되지 않고 여전히 me다', () => {
    const options = Reflect.getMetadata(COMMAND_DECORATOR_KEY, MeCommand.prototype) as {
      name: string;
    };

    expect(options.name).toBe('me');
  });

  it('T4 — ProfileCommand는 자체 constructor를 선언하지 않아 design:paramtypes가 부모(MeCommand)의 DI 의존 3개를 그대로 상속한다', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', ProfileCommand) as
      | unknown[]
      | undefined;

    expect(paramTypes).toBeDefined();
    expect(paramTypes).toHaveLength(3);
  });

  describe('T3 — onMe() 배선이 MeCommand와 동일하다', () => {
    let command: ProfileCommand;
    let apiClient: { getMeProfile: Mock };

    beforeEach(() => {
      apiClient = {
        getMeProfile: vi.fn().mockResolvedValue({
          ok: true,
          days: 15,
          data: { imageBase64: Buffer.from('png').toString('base64') },
        }),
      };

      const i18n = new BotI18nService();
      i18n.onModuleInit();
      command = new ProfileCommand(
        apiClient as unknown as BotApiClientService,
        i18n,
        new LocaleResolverService({
          getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
        } as unknown as BotApiClientService),
      );
    });

    it('guildId/userId/displayName/avatarUrl/locale/mentType을 MeCommand와 동일 인자로 getMeProfile에 전달한다', async () => {
      const interaction = makeInteraction();

      await command.onMe(interaction, new MeCommandDto());

      expect(apiClient.getMeProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: GUILD_ID,
          userId: USER_ID,
          displayName: 'Alice',
          avatarUrl: 'https://cdn/avatar.png',
          locale: 'ko',
          mentType: 'analysis',
        }),
      );
    });

    it("dto.view='voice' 지정 시 options.viewOption='voice'로 전달된다(MeCommand와 동일)", async () => {
      const interaction = makeInteraction();
      const dto = new MeCommandDto();
      dto.view = MeViewOption.Voice;

      await command.onMe(interaction, dto);

      expect(apiClient.getMeProfile).toHaveBeenCalledWith(
        expect.objectContaining({ viewOption: 'voice' }),
      );
    });

    it('응답이 /me와 동일하다 — 공개(비-ephemeral) deferReply + 첨부명 profile.png + 버튼 3종(customId 포함)', async () => {
      const interaction = makeInteraction();

      await command.onMe(interaction, new MeCommandDto());

      // 공개 응답 — ephemeral 플래그 없이 deferReply() 호출(MeCommand와 동일 패턴)
      expect(interaction.deferReply).toHaveBeenCalledWith();

      const call = (interaction.editReply as Mock).mock.calls[0][0] as {
        files: Array<{ name: string }>;
        components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
      };
      expect(call.files).toHaveLength(1);
      expect(call.files[0].name).toBe('profile.png');

      const buttons = call.components[0].components.map((b) => b.toJSON());
      expect(buttons).toHaveLength(3);
      expect(buttons[1]).toMatchObject({ custom_id: 'me:leaderboard' });
      expect(buttons[2]).toMatchObject({ custom_id: 'me:activity_detail' });
    });
  });
});
