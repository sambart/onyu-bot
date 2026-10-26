/**
 * VersionCommand 단위 테스트 — `/version` 표시값이 package.json 이 아니라 빌드 주입
 * `APP_VERSION`(git 태그 기반)을 따르는지 검증한다.
 */
import type { ClientEvents, EmbedBuilder } from 'discord.js';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

import { VersionCommand } from './version.command';

const originalAppVersion = process.env['APP_VERSION'];

function makeArgs(): { args: ClientEvents['interactionCreate']; reply: Mock } {
  const reply = vi.fn().mockResolvedValue(undefined);
  const interaction = { isChatInputCommand: () => true, reply };
  // as 단언: 테스트에 필요한 isChatInputCommand/reply 만 갖춘 최소 목이라 discord.js 타입과 불일치
  return { args: [interaction] as unknown as ClientEvents['interactionCreate'], reply };
}

function getDescription(reply: Mock): string {
  const payload = reply.mock.calls[0][0] as { embeds: EmbedBuilder[] };
  return payload.embeds[0].toJSON().description ?? '';
}

describe('VersionCommand', () => {
  afterEach(() => {
    if (originalAppVersion === undefined) {
      delete process.env['APP_VERSION'];
    } else {
      process.env['APP_VERSION'] = originalAppVersion;
    }
  });

  it('APP_VERSION 이 주입되면 그 값을 그대로 표시한다', async () => {
    process.env['APP_VERSION'] = ' v1.83.0 ';
    const { args, reply } = makeArgs();

    await new VersionCommand().onVersion(args);

    expect(getDescription(reply)).toBe('v1.83.0');
  });

  it('APP_VERSION 미주입(로컬 개발)이면 dev 를 표시한다', async () => {
    delete process.env['APP_VERSION'];
    const { args, reply } = makeArgs();

    await new VersionCommand().onVersion(args);

    expect(getDescription(reply)).toBe('dev');
  });
});
