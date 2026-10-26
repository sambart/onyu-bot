/**
 * Discord 채널 은닉(Channel Obfuscation) 관측 로깅(A-11, 선택 W5) — F-VOICE-135, 계획 §7 T6.
 * Logger를 스파이해 은닉 리터럴이 로그 문자열에 등장하지 않음을 단언하고,
 * `channelUpdate`의 old/new 독립 판정도 검증한다.
 */
import type { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { Channel } from 'discord.js';
import { of } from 'rxjs';

import { BotChannelStateHandler } from './bot-channel-state.handler';

/** F-VOICE-135 실측(리뷰 §⑤-5) 대로 은닉 채널·카테고리의 `name` 은 정확히 이 리터럴로 온다. */
const OBFUSCATED_NAME = '___hidden___';
/** F-VOICE-135 — `CHANNEL_OBFUSCATED` 플래그 비트(`1 << 17` = 131072, 실측값). */
const OBFUSCATED_BIT = 131072;

interface ChannelOverrides {
  guildId?: string | null;
  isDM?: boolean;
  isThread?: boolean;
}

function makeChannel(
  id: string,
  name: string,
  flagsBitfield = 0,
  overrides: ChannelOverrides = {},
): Channel {
  return {
    id,
    name,
    guildId: overrides.guildId === undefined ? 'guild-1' : overrides.guildId,
    flags: { bitfield: flagsBitfield },
    isDMBased: () => overrides.isDM ?? false,
    isThread: () => overrides.isThread ?? false,
  } as unknown as Channel;
}

function makeApiClient(): { reportChannelDeleted: ReturnType<typeof vi.fn> } {
  return { reportChannelDeleted: vi.fn().mockResolvedValue(undefined) };
}

describe('BotChannelStateHandler — 은닉 로깅(F-VOICE-135)', () => {
  let handler: BotChannelStateHandler;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    handler = new BotChannelStateHandler(makeApiClient() as unknown as BotApiClientService);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('channelCreate: 은닉 채널이면 실명 대신 (hidden)+id가 로그에 남고 실명은 등장하지 않는다', () => {
    handler.handleChannelCreate(makeChannel('ch-1', OBFUSCATED_NAME, OBFUSCATED_BIT));

    expect(logSpy).toHaveBeenCalledOnce();
    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('(hidden)');
    expect(logged).toContain('ch-1');
    expect(logged).not.toContain(OBFUSCATED_NAME);
  });

  it('channelCreate: 일반 채널이면 실명이 그대로 로그에 남는다(회귀 없음)', () => {
    handler.handleChannelCreate(makeChannel('ch-2', '실명채널', 0));

    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('실명채널');
    expect(logged).not.toContain('(hidden)');
  });

  it('channelDelete: 은닉 채널이면 실명 대신 (hidden)+id가 로그에 남는다', () => {
    handler.handleChannelDelete(makeChannel('ch-3', OBFUSCATED_NAME, OBFUSCATED_BIT));

    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('(hidden)');
    expect(logged).not.toContain(OBFUSCATED_NAME);
  });

  it('channelUpdate: old만 은닉 → new만 실명이면 (hidden)에서 실명으로의 전환이 로그로 드러난다', () => {
    const oldChannel = makeChannel('ch-4', OBFUSCATED_NAME, OBFUSCATED_BIT);
    const newChannel = makeChannel('ch-4', '복구된실명', 0);

    handler.handleChannelUpdate(oldChannel, newChannel);

    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('(hidden)');
    expect(logged).toContain('복구된실명');
    expect(logged).not.toContain(OBFUSCATED_NAME);
  });

  it('channelUpdate: old/new 둘 다 은닉이면 실명이 아닌 가짜 rename이 로그에 남지 않는다(핵심 단언)', () => {
    const oldChannel = makeChannel('ch-5', OBFUSCATED_NAME, OBFUSCATED_BIT);
    const newChannel = makeChannel('ch-5', OBFUSCATED_NAME, OBFUSCATED_BIT);

    handler.handleChannelUpdate(oldChannel, newChannel);

    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).not.toContain(OBFUSCATED_NAME);
    // 존재하지 않는 rename("A에서 A로")이 사실인 것처럼 보이면 안 된다 — old/new 둘 다 (hidden)이다.
    expect((logged.match(/\(hidden\)/g) ?? []).length).toBe(2);
  });

  it('channelUpdate: old/new 둘 다 실명이면 기존 로그 형식 그대로다(회귀 없음)', () => {
    const oldChannel = makeChannel('ch-6', '이전이름', 0);
    const newChannel = makeChannel('ch-6', '새이름', 0);

    handler.handleChannelUpdate(oldChannel, newChannel);

    const logged = logSpy.mock.calls[0][0] as string;
    expect(logged).toContain('이전이름');
    expect(logged).toContain('새이름');
  });
});

describe('BotChannelStateHandler — channelDelete → SA3 보고', () => {
  let apiClient: ReturnType<typeof makeApiClient>;
  let handler: BotChannelStateHandler;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    apiClient = makeApiClient();
    handler = new BotChannelStateHandler(apiClient as unknown as BotApiClientService);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined as never);
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('길드 채널 삭제 시 guildId·channelId 만 전송한다(채널명 키 없음)', () => {
    handler.handleChannelDelete(makeChannel('ch-1', '비밀채널'));

    expect(apiClient.reportChannelDeleted).toHaveBeenCalledOnce();
    expect(apiClient.reportChannelDeleted).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'ch-1',
    });
  });

  it.each([
    ['DM', { isDM: true }],
    ['스레드', { isThread: true }],
    ['guildId 없음', { guildId: null }],
  ])('%s 채널은 보고하지 않는다', (_label, overrides) => {
    handler.handleChannelDelete(makeChannel('ch-2', 'x', 0, overrides));

    expect(apiClient.reportChannelDeleted).not.toHaveBeenCalled();
  });

  it('SDK 가 reject 해도 핸들러는 throw 하지 않고 warn 만 남긴다', async () => {
    apiClient.reportChannelDeleted.mockRejectedValue(new Error('network'));

    expect(() => handler.handleChannelDelete(makeChannel('ch-3', 'x'))).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('ch-3');
  });

  it('채널 생성·변경은 보고하지 않는다', () => {
    const channel = makeChannel('ch-4', 'x');
    handler.handleChannelCreate(channel);
    handler.handleChannelUpdate(channel, channel);

    expect(apiClient.reportChannelDeleted).not.toHaveBeenCalled();
  });
});

describe('BotChannelStateHandler — 실제 BotApiClientService 경로(TC-WEBA-29)', () => {
  it('POST /bot-api/settings-auto-action/channel-deleted 로 {guildId, channelId} 만 보낸다', async () => {
    const post = vi.fn().mockReturnValue(of({ data: { ok: true, recorded: 0 } }));
    const client = new BotApiClientService({ post } as unknown as HttpService);
    const handler = new BotChannelStateHandler(client);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined as never);

    handler.handleChannelDelete(makeChannel('ch-9', '채널'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(post).toHaveBeenCalledWith(
      '/bot-api/settings-auto-action/channel-deleted',
      { guildId: 'guild-1', channelId: 'ch-9' },
      undefined,
    );
    vi.restoreAllMocks();
  });
});
