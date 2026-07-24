import { Logger } from '@nestjs/common';
import type { BotApiClientService } from '@onyu/bot-api-client';
import type { Interaction } from 'discord.js';
import type { Mocked } from 'vitest';

import { BotCommandUsageHandler } from './bot-command-usage.handler';

/** discord.js Interaction의 conditional 제네릭 타입을 우회하기 위한 테스트 전용 셰이프 */
interface FakeInteraction {
  isChatInputCommand: () => boolean;
  guildId: string | null;
  commandName: string;
  locale: string;
}

function makeInteraction(overrides: Partial<FakeInteraction> = {}): Interaction {
  const fake: FakeInteraction = {
    isChatInputCommand: () => true,
    guildId: 'guild-1',
    commandName: 'voice',
    locale: 'ko',
    ...overrides,
  };
  return fake as unknown as Interaction;
}

describe('BotCommandUsageHandler', () => {
  let handler: BotCommandUsageHandler;
  let apiClient: Mocked<BotApiClientService>;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined as never);
    apiClient = {
      sendCommandUsed: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<BotApiClientService>;
    handler = new BotCommandUsageHandler(apiClient);
  });

  it('isChatInputCommand()가 false면 sendCommandUsed를 호출하지 않는다 (F-USAGE-002, TC-UC01-04)', async () => {
    const interaction = makeInteraction({ isChatInputCommand: () => false });

    await handler.handleInteractionCreate(interaction);

    expect(apiClient.sendCommandUsed).not.toHaveBeenCalled();
  });

  it('guildId가 null이면(DM) sendCommandUsed를 호출하지 않는다 (F-USAGE-002, TC-UC01-05)', async () => {
    const interaction = makeInteraction({ guildId: null });

    await handler.handleInteractionCreate(interaction);

    expect(apiClient.sendCommandUsed).not.toHaveBeenCalled();
  });

  it('isChatInputCommand() false와 guildId null이 동시에 발생해도 호출하지 않는다', async () => {
    const interaction = makeInteraction({ isChatInputCommand: () => false, guildId: null });

    await handler.handleInteractionCreate(interaction);

    expect(apiClient.sendCommandUsed).not.toHaveBeenCalled();
  });

  it('필터를 통과하면 sendCommandUsed({guildId, commandName, locale})를 1회 호출한다', async () => {
    const interaction = makeInteraction({
      guildId: 'guild-42',
      commandName: 'leaderboard',
      locale: 'en-US',
    });

    await handler.handleInteractionCreate(interaction);

    expect(apiClient.sendCommandUsed).toHaveBeenCalledTimes(1);
    expect(apiClient.sendCommandUsed).toHaveBeenCalledWith({
      guildId: 'guild-42',
      commandName: 'leaderboard',
      locale: 'en-US',
    });
  });

  it('payload에 유저 ID·커맨드 인자 등 다른 필드를 포함하지 않는다(개인 미식별 🔒)', async () => {
    const interaction = makeInteraction();

    await handler.handleInteractionCreate(interaction);

    const payload = apiClient.sendCommandUsed.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['commandName', 'guildId', 'locale']);
  });

  it('sendCommandUsed가 reject해도 예외를 던지지 않고 logger.error로 로그만 남긴다', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined as never);
    apiClient.sendCommandUsed.mockRejectedValue(new Error('network error'));
    const interaction = makeInteraction();

    await expect(handler.handleInteractionCreate(interaction)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
  });
});
