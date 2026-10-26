import { ConfigModule, ConfigService } from '@nestjs/config';
import { GatewayIntentBits, Options } from 'discord.js';

/**
 * 메시지 캐시 청소 주기·수명(초) — 포렌식 D2 (b) ③ `sweepers` 집행(A4).
 *
 * 메시지 캐시는 봇에서 **읽는 곳이 한 곳도 없다**(`messageCreate` 핸들러 2종은 payload 를
 * 그대로 API 로 포워딩할 뿐 캐시를 되읽지 않는다). 그런데 discord.js 기본값은 채널당 200건
 * 상한(`MessageManager: 200`)만 걸 뿐 만료 청소를 하지 않아, 길드·텍스트채널 수에 비례해
 * 쓰이지 않는 객체가 계속 상주한다. 프로덕션 실측(2026-09-17 `bot-rss-observations.json`)의
 * 봇 RSS 증가 +1.25MiB/h 는 멤버 캐시로는 설명되지 않는다 — 멤버 캐시는 부팅 시 전량 적재돼
 * 기준선(가동 2.1h · 97.8MiB)에 이미 포함돼 있기 때문이다. 메시지 캐시가 가장 유력한 축이며,
 * 동시에 소비처가 0이라 **유일하게 기능 위험 없이 회수 가능한 대상**이다.
 *
 * lifetime 1시간은 순수 안전마진이다(소비처가 없으므로 기능상 근거는 0이지만, 0은
 * `filterByLifetime` 이 비활성으로 취급하므로 쓸 수 없다). discord.js 문서 예시값
 * (interval 300 / lifetime 600)보다 보수적으로 잡았다. interval 은 lifetime 의 절반.
 *
 * ⚠️ `guildMembers` 는 여기에 **넣지 말 것**. `VoiceState.member` 가 멤버 캐시 조회 getter 라
 * 멤버가 캐시에서 빠지면 `channel.members` 에서 그 사용자가 통째로 사라지고, 음성 추적
 * (`bot-voice-sync.handler`)과 동시접속 스냅샷(`bot-co-presence.scheduler`)이 예외도 로그도
 * 없이 데이터를 잃는다. `voiceStates`·`presences` 도 각각 음성 추적과 게임방 접두사의 유일한
 * 소스라 청소 대상이 아니다.
 */
const MESSAGE_SWEEP_INTERVAL_SEC = 1800;
const MESSAGE_SWEEP_LIFETIME_SEC = 3600;

export const DiscordConfig = {
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => ({
    token: configService.get('DISCORD_API_TOKEN'),
    discordClientOptions: {
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
      ],
      // 기본 sweepers(`threads`)를 반드시 펼쳐서 유지한다 — `sweepers` 를 지정하는 순간
      // discord.js 기본값이 통째로 대체돼, 빠뜨리면 돌고 있던 스레드 청소가 사라진다.
      sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
          interval: MESSAGE_SWEEP_INTERVAL_SEC,
          lifetime: MESSAGE_SWEEP_LIFETIME_SEC,
        },
      },
    },
    registerCommandOptions: [
      {
        removeCommandsBefore: true,
      },
    ],
    failOnLogin: true,
  }),
  inject: [ConfigService],
};
