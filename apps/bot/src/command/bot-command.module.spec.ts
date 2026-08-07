/**
 * BotCommandModule — provider 등록 스모크 테스트
 *
 * `/voice-flush` 폐지 후 6종 → `/help`(F-GENERAL-006) 추가로 7종 커맨드가
 * 정확히 등록되어 있는지, 그리고 삭제된 커맨드가 다시 섞여 들어오지 않는지
 * (회귀 방지)를 검증한다.
 *
 * DiscordModule.forFeature() / BotCommonModule 은 Discord 클라이언트 등
 * 실제 인프라 의존을 요구하므로 여기서는 @Module 데코레이터 메타데이터만
 * 검사한다(app.module.spec.ts 와 동일한 방식) — 전체 DI compile 은 하지 않는다.
 */

import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { BotCommonModule } from '../common/bot-common.module';
import { BotCommandModule } from './bot-command.module';
import { BestFriendCommand } from './friend/best-friend.command';
import { HelpCommand } from './help.command';
import { MeCommand } from './me.command';
import { StickyMessageDeleteCommand } from './sticky-message/sticky-message-delete.command';
import { StickyMessageListCommand } from './sticky-message/sticky-message-list.command';
import { StickyMessageRegisterCommand } from './sticky-message/sticky-message-register.command';
import { VersionCommand } from './version.command';

describe('BotCommandModule', () => {
  describe('providers', () => {
    it('voice-flush 폐지 후 정확히 7개의 커맨드만 등록되어 있다', () => {
      const providers = Reflect.getMetadata('providers', BotCommandModule) as unknown[];

      expect(providers).toHaveLength(7);
      expect(providers).toEqual(
        expect.arrayContaining([
          VersionCommand,
          HelpCommand,
          StickyMessageRegisterCommand,
          StickyMessageDeleteCommand,
          StickyMessageListCommand,
          MeCommand,
          BestFriendCommand,
        ]),
      );
    });

    it('삭제된 VoiceFlushCommand 를 더 이상 참조하지 않는다', () => {
      const providers = Reflect.getMetadata('providers', BotCommandModule) as Array<{
        name?: string;
      }>;
      const providerNames = providers.map((provider) => provider?.name);

      expect(providerNames).not.toContain('VoiceFlushCommand');
    });
  });

  describe('imports', () => {
    it('DiscordModule.forFeature() 와 BotCommonModule 을 그대로 유지한다', () => {
      const imports = Reflect.getMetadata('imports', BotCommandModule) as unknown[];

      expect(imports).toHaveLength(2);
      expect(imports).toContainEqual(BotCommonModule);
    });
  });
});
