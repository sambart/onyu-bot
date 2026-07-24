import type { Client, Collection, Guild, GuildMember, VoiceState } from 'discord.js';
import type { Mocked } from 'vitest';

import { BotPrometheusService } from './bot-prometheus.service';

/** Guild voiceStates mock 생성 헬퍼
 *
 * Discord.js Collection은 Map을 확장하며 filter() 메서드를 제공한다.
 * 일반 Map은 filter()가 없으므로, filter()를 지원하는 mock을 직접 구현한다.
 */
function makeVoiceStates(entries: Array<{ channelId: string | null; isBot: boolean }>): {
  cache: Collection<string, VoiceState>;
} {
  const items = entries.map(
    (entry, idx) =>
      [
        String(idx),
        {
          channelId: entry.channelId,
          member: {
            user: { bot: entry.isBot },
          } as unknown as GuildMember,
        } as unknown as VoiceState,
      ] as const,
  );

  const collectionLike = {
    // filter()는 Discord.js Collection 고유 메서드 (Array 스타일 predicate, Collection 반환)
    filter: (fn: (vs: VoiceState) => boolean) => {
      const filtered = items.filter(([, vs]) => fn(vs));
      return { size: filtered.length };
    },
  };

  return { cache: collectionLike as unknown as Collection<string, VoiceState> };
}

/** Guild mock 생성 헬퍼 */
function makeGuild(
  id: string,
  voiceEntries: Array<{ channelId: string | null; isBot: boolean }>,
): Guild {
  return {
    id,
    voiceStates: makeVoiceStates(voiceEntries),
  } as unknown as Guild;
}

// eslint-disable-next-line max-lines-per-function -- describe 블록은 구조상 불가피하게 길어진다
describe('BotPrometheusService', () => {
  let service: BotPrometheusService;
  let client: Mocked<Client>;

  beforeEach(() => {
    const guildMap = new Map<string, Guild>();
    client = {
      isReady: vi.fn(),
      ws: { ping: 42 },
      guilds: { cache: guildMap as unknown as Collection<string, Guild> },
      uptime: 60000,
    } as unknown as Mocked<Client>;

    // @InjectDiscordClient()를 우회하여 직접 생성
    // as unknown 경유: Client 전체 인터페이스를 구현하지 않아 이중 단언이 필요하다
    service = new BotPrometheusService(client as unknown as Client);
    service.onModuleInit();
  });

  describe('getMetrics', () => {
    it('Prometheus 텍스트 형식의 문자열을 반환한다', async () => {
      const result = await service.getMetrics();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('discord_gateway_ping_ms 메트릭이 포함된다', async () => {
      const result = await service.getMetrics();

      expect(result).toContain('discord_gateway_ping_ms');
    });

    it('discord_guild_count 메트릭이 포함된다', async () => {
      const result = await service.getMetrics();

      expect(result).toContain('discord_guild_count');
    });

    it('discord_voice_users_total 메트릭이 포함된다', async () => {
      const result = await service.getMetrics();

      expect(result).toContain('discord_voice_users_total');
    });

    it('bot_uptime_seconds 메트릭이 포함된다', async () => {
      const result = await service.getMetrics();

      expect(result).toContain('bot_uptime_seconds');
    });
  });

  describe('getContentType', () => {
    it('Prometheus 텍스트 포맷 Content-Type을 반환한다', () => {
      const result = service.getContentType();

      expect(result).toContain('text/plain');
    });
  });

  describe('refreshMetrics — Discord Client 연결 상태', () => {
    it('Client 연결 상태에서 ws.ping 값으로 discord_gateway_ping_ms가 설정된다', async () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      (client.ws as { ping: number }).ping = 150;

      service.refreshMetrics();

      const metrics = await service.getMetrics();
      expect(metrics).toContain('discord_gateway_ping_ms 150');
    });

    it('Client 연결 상태에서 guilds.cache.size로 discord_guild_count가 설정된다', async () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      const guild = makeGuild('guild-1', []);
      const guildMap = new Map([['guild-1', guild]]);
      (client.guilds as { cache: unknown }).cache = guildMap;

      service.refreshMetrics();

      const metrics = await service.getMetrics();
      expect(metrics).toContain('discord_guild_count 1');
    });

    it('Client 연결 상태에서 uptime을 초로 환산하여 bot_uptime_seconds가 설정된다', async () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      (client as { uptime: number }).uptime = 120000; // 120초

      service.refreshMetrics();

      const metrics = await service.getMetrics();
      expect(metrics).toContain('bot_uptime_seconds 120');
    });

    it('음성 채널에 있는 사용자 수(봇 제외)가 discord_voice_users_total에 기록된다', async () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      const guild = makeGuild('guild-abc', [
        { channelId: 'ch-1', isBot: false }, // 카운트 대상
        { channelId: 'ch-1', isBot: false }, // 카운트 대상
        { channelId: 'ch-1', isBot: true }, // 봇 — 제외
        { channelId: null, isBot: false }, // 음성 채널 아님 — 제외
      ]);
      const guildMap = new Map([['guild-abc', guild]]);
      (client.guilds as { cache: unknown }).cache = guildMap;

      service.refreshMetrics();

      const metrics = await service.getMetrics();
      // guildId 레이블이 포함되고 카운트가 2여야 함
      expect(metrics).toContain('guildId="guild-abc"');
      expect(metrics).toContain('} 2');
    });

    it('봇만 있는 음성 채널은 discord_voice_users_total이 0이다', async () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      const guild = makeGuild('guild-bots', [
        { channelId: 'ch-1', isBot: true },
        { channelId: 'ch-1', isBot: true },
      ]);
      const guildMap = new Map([['guild-bots', guild]]);
      (client.guilds as { cache: unknown }).cache = guildMap;

      service.refreshMetrics();

      const metrics = await service.getMetrics();
      expect(metrics).toContain('guildId="guild-bots"');
      expect(metrics).toContain('} 0');
    });
  });

  describe('refreshMetrics — Discord Client 미연결 상태', () => {
    it('미연결 시 discord_gateway_ping_ms는 0으로 설정된다', async () => {
      vi.mocked(client.isReady).mockReturnValue(false);

      service.refreshMetrics();

      const metrics = await service.getMetrics();
      expect(metrics).toContain('discord_gateway_ping_ms 0');
    });

    it('미연결 시 discord_guild_count는 0으로 설정된다', async () => {
      vi.mocked(client.isReady).mockReturnValue(false);

      service.refreshMetrics();

      const metrics = await service.getMetrics();
      expect(metrics).toContain('discord_guild_count 0');
    });

    it('미연결 시 bot_uptime_seconds는 0으로 설정된다', async () => {
      vi.mocked(client.isReady).mockReturnValue(false);

      service.refreshMetrics();

      const metrics = await service.getMetrics();
      expect(metrics).toContain('bot_uptime_seconds 0');
    });

    it('미연결 시 discord_voice_users_total은 갱신하지 않는다 (이전 값 유지)', async () => {
      // 먼저 연결 상태로 값 설정
      vi.mocked(client.isReady).mockReturnValue(true);
      const guild = makeGuild('guild-xyz', [
        { channelId: 'ch-1', isBot: false },
        { channelId: 'ch-1', isBot: false },
      ]);
      const guildMap = new Map([['guild-xyz', guild]]);
      (client.guilds as { cache: unknown }).cache = guildMap;
      service.refreshMetrics();

      // 이후 미연결 상태로 재갱신
      vi.mocked(client.isReady).mockReturnValue(false);
      service.refreshMetrics();

      // voice 값은 이전 값(2)이 유지되어야 함
      const metrics = await service.getMetrics();
      expect(metrics).toContain('guildId="guild-xyz"');
      expect(metrics).toContain('} 2');
    });
  });

  describe('refreshMetrics — 예외 처리', () => {
    it('client.isReady()가 예외를 throw해도 서비스가 정상 동작한다', () => {
      vi.mocked(client.isReady).mockImplementation(() => {
        throw new Error('Connection error');
      });

      // 예외가 전파되지 않고 내부에서 처리되어야 함
      expect(() => service.refreshMetrics()).not.toThrow();
    });
  });

  // getSnapshot()은 F-SUPER-ADMIN-016(봇 헬스 스냅샷 push)용 raw 값 스냅샷이다.
  // API 측 BotHealthSnapshotDto가 @IsInt() @Min(0) 계약이므로, 이 DTO 계약을 항상
  // 만족하는지(정수 uptimeSeconds, 0 이상 gatewayPing) 를 반드시 검증한다.
  describe('getSnapshot — Discord Client 미준비 상태', () => {
    it('client.isReady()가 false면 전 필드가 0인 스냅샷을 반환한다', () => {
      vi.mocked(client.isReady).mockReturnValue(false);
      // 미준비 상태에서도 ws.ping/uptime 이 non-zero 값을 갖고 있을 수 있으나 무시되어야 함
      (client.ws as { ping: number }).ping = 999;
      (client as { uptime: number }).uptime = 999_000;

      const snapshot = service.getSnapshot();

      expect(snapshot).toEqual({
        gatewayPing: 0,
        guildCount: 0,
        voiceUsersTotal: 0,
        uptimeSeconds: 0,
      });
    });
  });

  describe('getSnapshot — DTO 계약(@IsInt @Min(0)) 준수', () => {
    it('uptime(ms)이 나눗셈 시 소수가 되는 값이어도 uptimeSeconds는 정수(내림)이다', () => {
      const NON_INTEGER_UPTIME_MS = 1_234_567; // 1234.567초 — 정수 아님
      const EXPECTED_FLOORED_UPTIME_SECONDS = 1_234;
      vi.mocked(client.isReady).mockReturnValue(true);
      (client as { uptime: number }).uptime = NON_INTEGER_UPTIME_MS;

      const snapshot = service.getSnapshot();

      expect(snapshot.uptimeSeconds).toBe(EXPECTED_FLOORED_UPTIME_SECONDS);
      expect(Number.isInteger(snapshot.uptimeSeconds)).toBe(true);
    });

    it('uptime이 정확히 초 단위로 나누어떨어지면 그 값을 그대로 사용한다', () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      (client as { uptime: number }).uptime = 60_000;

      const snapshot = service.getSnapshot();

      expect(snapshot.uptimeSeconds).toBe(60);
    });

    it('client.ws.ping이 -1(하트비트 ACK 이전)이어도 gatewayPing은 0 이상으로 클램프된다', () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      (client.ws as { ping: number }).ping = -1;

      const snapshot = service.getSnapshot();

      expect(snapshot.gatewayPing).toBe(0);
      expect(snapshot.gatewayPing).toBeGreaterThanOrEqual(0);
    });

    it('client.ws.ping이 정상값(양수)이면 그대로 사용한다', () => {
      const POSITIVE_PING_MS = 55;
      vi.mocked(client.isReady).mockReturnValue(true);
      (client.ws as { ping: number }).ping = POSITIVE_PING_MS;

      const snapshot = service.getSnapshot();

      expect(snapshot.gatewayPing).toBe(POSITIVE_PING_MS);
    });
  });

  describe('getSnapshot — guildCount 집계', () => {
    it('guildCount는 client.guilds.cache.size 이다', () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      const guildMap = new Map([
        ['guild-1', makeGuild('guild-1', [])],
        ['guild-2', makeGuild('guild-2', [])],
      ]);
      (client.guilds as { cache: unknown }).cache = guildMap;

      const snapshot = service.getSnapshot();

      expect(snapshot.guildCount).toBe(2);
    });

    it('길드가 하나도 없으면 guildCount는 0이다', () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      (client.guilds as { cache: unknown }).cache = new Map();

      const snapshot = service.getSnapshot();

      expect(snapshot.guildCount).toBe(0);
    });
  });

  describe('getSnapshot — voiceUsersTotal 집계', () => {
    it('voiceUsersTotal은 전 길드 음성 채널 사용자 수(봇 제외)의 합이다', () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      const guildMap = new Map([
        [
          'guild-1',
          makeGuild('guild-1', [
            { channelId: 'ch-1', isBot: false },
            { channelId: 'ch-1', isBot: false },
          ]),
        ],
        ['guild-2', makeGuild('guild-2', [{ channelId: 'ch-2', isBot: false }])],
      ]);
      (client.guilds as { cache: unknown }).cache = guildMap;

      const snapshot = service.getSnapshot();

      expect(snapshot.voiceUsersTotal).toBe(3);
    });

    it('길드가 하나도 없으면 voiceUsersTotal은 0이다', () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      (client.guilds as { cache: unknown }).cache = new Map();

      const snapshot = service.getSnapshot();

      expect(snapshot.voiceUsersTotal).toBe(0);
    });
  });

  describe('getSnapshot — voiceUsersTotal 제외 조건', () => {
    it('봇 계정(isBot=true)은 voiceUsersTotal 집계에서 제외된다', () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      const guildMap = new Map([
        [
          'guild-1',
          makeGuild('guild-1', [
            { channelId: 'ch-1', isBot: false },
            { channelId: 'ch-1', isBot: true },
            { channelId: 'ch-1', isBot: true },
          ]),
        ],
      ]);
      (client.guilds as { cache: unknown }).cache = guildMap;

      const snapshot = service.getSnapshot();

      expect(snapshot.voiceUsersTotal).toBe(1);
    });

    it('channelId가 null(음성 채널 미접속)인 voiceState는 voiceUsersTotal 집계에서 제외된다', () => {
      vi.mocked(client.isReady).mockReturnValue(true);
      const guildMap = new Map([
        [
          'guild-1',
          makeGuild('guild-1', [
            { channelId: 'ch-1', isBot: false },
            { channelId: null, isBot: false },
          ]),
        ],
      ]);
      (client.guilds as { cache: unknown }).cache = guildMap;

      const snapshot = service.getSnapshot();

      expect(snapshot.voiceUsersTotal).toBe(1);
    });
  });
});
