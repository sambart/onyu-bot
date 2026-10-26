/**
 * DiscordConfig — discord.js 클라이언트 캐시 청소(sweepers) 설정 검증
 *
 * 포렌식 D2 (b) ③ 집행(A4). 이 설정은 "잘못 넣으면 조용히 데이터를 잃는" 종류라, 값 자체보다
 * **넣지 말아야 할 것이 안 들어갔는지**를 회귀로 고정하는 것이 본 스펙의 목적이다.
 */

import { type ConfigService } from '@nestjs/config';
import { Options } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { DiscordConfig } from './discord.config';

interface SweeperOptions {
  messages?: { interval: number; lifetime: number };
  threads?: { interval: number; lifetime: number };
  [key: string]: unknown;
}

function buildSweepers(): SweeperOptions {
  // useFactory 는 ConfigService.get 만 쓴다 — 토큰 값은 본 스펙의 관심사가 아니다.
  const configService = { get: () => 'test-token' } as unknown as ConfigService;
  const options = DiscordConfig.useFactory(configService);

  return options.discordClientOptions.sweepers as SweeperOptions;
}

describe('DiscordConfig sweepers', () => {
  it('메시지 캐시를 30분 주기로 1시간 지난 것부터 청소한다', () => {
    expect(buildSweepers().messages).toEqual({ interval: 1800, lifetime: 3600 });
  });

  it('discord.js 기본 threads 청소를 그대로 유지한다', () => {
    // sweepers 를 지정하면 기본값이 대체되므로, 스프레드를 빠뜨리면 돌고 있던 청소가 사라진다.
    expect(buildSweepers().threads).toEqual(Options.DefaultSweeperSettings.threads);
  });

  it.each(['guildMembers', 'voiceStates', 'presences'])(
    '%s 는 청소하지 않는다 — 음성 추적·동시접속·게임방 접두사가 조용히 깨진다',
    (cacheKey) => {
      expect(buildSweepers()[cacheKey]).toBeUndefined();
    },
  );

  it('users 는 청소하지 않는다 — GuildMember.user 강참조라 메모리 회수 효과가 없다', () => {
    expect(buildSweepers().users).toBeUndefined();
  });
});
