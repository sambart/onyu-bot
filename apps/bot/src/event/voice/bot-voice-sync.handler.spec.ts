import { type BotApiClientService, type VoiceSyncDto } from '@onyu/bot-api-client';
import { ChannelType, type Client } from 'discord.js';
import { type Mock } from 'vitest';

import { BotVoiceSyncHandler } from './bot-voice-sync.handler';

/**
 * discord.js Collection의 최소 fake — 본 핸들러가 실제로 쓰는 filter/values만 구현한다.
 * (dispatcher spec의 `as unknown as` 캐스팅 관례 승계 — 실제 클래스 인스턴스 생성 불필요)
 */
interface FakeCollection<T> {
  filter: (fn: (item: T) => boolean) => FakeCollection<T>;
  values: () => IterableIterator<T>;
}

function makeCollection<T>(items: T[]): FakeCollection<T> {
  return {
    filter: (fn: (item: T) => boolean) => makeCollection(items.filter(fn)),
    values: () => items.values(),
  };
}

function makeVoiceState(overrides: Record<string, unknown> = {}) {
  return {
    selfMute: false,
    selfDeaf: false,
    selfVideo: false,
    streaming: false,
    serverMute: false,
    serverDeaf: false,
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    displayName: 'Alice',
    user: { bot: false },
    displayAvatarURL: () => 'https://avatar/alice.png',
    presence: null,
    voice: makeVoiceState(),
    ...overrides,
  };
}

function makeVoiceChannel(id: string, members: ReturnType<typeof makeMember>[]) {
  return {
    id,
    name: `채널-${id}`,
    type: ChannelType.GuildVoice,
    parentId: null,
    parent: null,
    members: makeCollection(members),
  };
}

function makeGuild(id: string, channels: ReturnType<typeof makeVoiceChannel>[]) {
  return {
    id,
    channels: { cache: makeCollection(channels) },
  };
}

describe('BotVoiceSyncHandler', () => {
  let apiClient: { healthCheck: Mock; pushVoiceSync: Mock };

  beforeEach(() => {
    apiClient = {
      healthCheck: vi.fn().mockResolvedValue(undefined),
      pushVoiceSync: vi.fn().mockResolvedValue(undefined),
    };
  });

  function makeHandler(guilds: ReturnType<typeof makeGuild>[]): BotVoiceSyncHandler {
    const client = { guilds: { cache: makeCollection(guilds) } };
    return new BotVoiceSyncHandler(
      client as unknown as Client,
      apiClient as unknown as BotApiClientService,
    );
  }

  it('강제뮤트(serverMute) 중인 유저는 micOn:false·serverMute:true로 복구 동기화된다 (UC-11 TC-11-08, 회귀 방지 핵심)', async () => {
    const member = makeMember({ voice: makeVoiceState({ selfMute: false, serverMute: true }) });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    expect(apiClient.pushVoiceSync).toHaveBeenCalledOnce();
    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.guildId).toBe('guild-1');
    expect(dto.users).toHaveLength(1);
    expect(dto.users[0]).toMatchObject({
      userId: 'user-1',
      micOn: false,
      serverMute: true,
      serverDeaf: false,
    });
  });

  it('selfMute/serverMute 모두 false면 micOn:true로 동기화된다 (舊 로직은 selfMute만 보고 micOn:true로 판정했던 것과 결과는 같지만, 이제는 serverMute도 반영된 판정이다)', async () => {
    const member = makeMember({ voice: makeVoiceState({ selfMute: false, serverMute: false }) });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.users[0].micOn).toBe(true);
  });

  it('serverDeaf가 부과된 유저는 payload에 serverDeaf:true가 포함된다', async () => {
    const member = makeMember({ voice: makeVoiceState({ serverDeaf: true }) });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.users[0].serverDeaf).toBe(true);
  });

  it('serverMute가 null이면 false로 정규화되어 micOn 판정에 영향을 주지 않는다 (null 안전)', async () => {
    const member = makeMember({
      voice: makeVoiceState({ selfMute: false, serverMute: null }),
    });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [member])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.users[0].micOn).toBe(true);
    expect(dto.users[0].serverMute).toBe(false);
  });

  it('음성 채널에 유저가 없으면 해당 길드는 pushVoiceSync를 호출하지 않는다', async () => {
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    expect(apiClient.pushVoiceSync).not.toHaveBeenCalled();
  });

  it('봇 유저는 동기화 대상에서 제외된다', async () => {
    const humanMember = makeMember({ id: 'user-1' });
    const botMember = makeMember({ id: 'bot-1', user: { bot: true } });
    const guild = makeGuild('guild-1', [makeVoiceChannel('ch-1', [humanMember, botMember])]);
    const handler = makeHandler([guild]);

    await handler.handleReady();

    const dto = apiClient.pushVoiceSync.mock.calls[0][0] as VoiceSyncDto;
    expect(dto.users).toHaveLength(1);
    expect(dto.users[0].userId).toBe('user-1');
  });
});
