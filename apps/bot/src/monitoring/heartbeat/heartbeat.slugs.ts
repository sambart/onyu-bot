/**
 * Healthchecks.io heartbeat slug 상수 — bot 소비자 전용.
 * `HEALTHCHECKS_PING_KEY`(env) + slug 조합으로 `https://hc-ping.com/<key>/<slug>` URL 구성.
 */
export const HEARTBEAT_SLUGS = {
  BOT_CO_PRESENCE_TICK: 'bot-co-presence-tick',
} as const;
