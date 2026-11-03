import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';

/** 길드별 활성 채널 집합 캐시 TTL(ms) — 새로 켠 고정이 봇에 반영되기까지의 최대 지연(F-STICKY-004) */
export const STICKY_ACTIVE_CHANNELS_TTL_MS = 60_000;
/** 조회 실패 후 재조회를 미루는 시간(ms) — 그동안은 fail-open(전량 전송)으로 현행 동작을 유지 */
export const STICKY_ACTIVE_CHANNELS_FAILURE_BACKOFF_MS = 15_000;
/** 캐시 맵 크기가 이 값을 넘으면 만료 항목을 쓸어낸다(탈퇴 길드 잔존 항목 방지) */
const CACHE_SWEEP_THRESHOLD = 10_000;

type CacheEntry =
  | { kind: 'known'; channelIds: ReadonlySet<string>; expiresAt: number }
  | { kind: 'unknown'; expiresAt: number };

/**
 * messageCreate 사전 필터용 "고정 바인딩 채널 집합" 길드별 인메모리 캐시(A22 ③).
 * 봇→API 단방향이라 무효화는 TTL 만료만 쓴다. 조회 실패는 fail-open(true)이다.
 */
@Injectable()
export class StickyActiveChannelCache {
  private readonly logger = new Logger(StickyActiveChannelCache.name);
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<ReadonlySet<string> | null>>();

  constructor(private readonly apiClient: BotApiClientService) {}

  /** 이 채널의 메시지를 sticky 엔드포인트로 보내야 하는가. 조회 실패 시 true(fail-open) */
  async shouldForward(guildId: string, channelId: string): Promise<boolean> {
    const entry = this.entries.get(guildId);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.kind === 'unknown' ? true : entry.channelIds.has(channelId);
    }

    const channelIds = await this.getOrStartFetch(guildId);
    return channelIds === null ? true : channelIds.has(channelId);
  }

  /** 같은 길드의 동시 미스를 진행 중인 조회 1건으로 합친다(single-flight) */
  private getOrStartFetch(guildId: string): Promise<ReadonlySet<string> | null> {
    const existing = this.inflight.get(guildId);
    if (existing !== undefined) return existing;

    // 정리는 set 이후에 보장되도록 finally 를 여기서 체인한다(동기 throw 시에도 정산된 Promise 잔존 방지)
    const started = this.fetchAndStore(guildId).finally(() => {
      this.inflight.delete(guildId);
    });
    this.inflight.set(guildId, started);
    return started;
  }

  private async fetchAndStore(guildId: string): Promise<ReadonlySet<string> | null> {
    try {
      const response = await this.apiClient.getStickyActiveChannels(guildId);
      const rawChannelIds: unknown = response.data.channelIds;
      if (!Array.isArray(rawChannelIds) || !rawChannelIds.every((id) => typeof id === 'string')) {
        // 응답 형태 이상을 빈 집합으로 캐시하면 해당 길드 sticky 전체가 막힌다 — fail-open 으로 보낸다
        throw new Error('invalid active-channels response shape');
      }
      const channelIds = new Set<string>(rawChannelIds);
      this.store(guildId, {
        kind: 'known',
        channelIds,
        expiresAt: Date.now() + STICKY_ACTIVE_CHANNELS_TTL_MS,
      });
      return channelIds;
    } catch (error) {
      this.store(guildId, {
        kind: 'unknown',
        expiresAt: Date.now() + STICKY_ACTIVE_CHANNELS_FAILURE_BACKOFF_MS,
      });
      // Nest Logger 는 마지막 string 인자를 context 로 취급하므로 단일 문자열로 합친다
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[BOT] sticky active-channels 조회 실패 — fail-open: guild=${guildId} (${reason})`,
      );
      return null;
    }
  }

  private store(guildId: string, entry: CacheEntry): void {
    if (this.entries.size >= CACHE_SWEEP_THRESHOLD) {
      this.sweepExpired();
    }
    this.entries.set(guildId, entry);
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) this.entries.delete(key);
    }
  }
}
