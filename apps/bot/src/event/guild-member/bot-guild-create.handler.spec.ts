/**
 * BotGuildCreateHandler 단위 테스트.
 *
 * 핵심 회귀 방지 (F-GUILD-MEMBER-002 A2, 2026-09-16 D1(b)):
 * - 멤버 동기화(syncGuild)와 guild_directory 기록(reconcileGuildDirectory)은 서로 독립이다 —
 *   한쪽이 실패해도 다른 쪽은 수행돼야 한다.
 * - reconcileGuildDirectory는 신규 길드 1건만 보내지 않고 봇이 참여 중인 길드 캐시 전체를
 *   보낸다 — 1건만 보내면 비활성화 비율 가드(candidates/totalActive > 0.5)가 매 가입마다
 *   튀어 ratio-exceeded warn 로그가 오염된다
 *   (`docs/reviews/2026-09-15-giant-guild-join-leave-forensics.md` G1/A2).
 */
import type { BotApiClientService, GuildDirectoryReconcileResult } from '@onyu/bot-api-client';
import type { Client, Guild, GuildMember } from 'discord.js';
import { Collection } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotGuildCreateHandler } from './bot-guild-create.handler';
import { BotGuildMemberSyncHandler } from './bot-guild-member-sync.handler';

function makeGuildMember(overrides: Record<string, unknown> = {}): GuildMember {
  return {
    id: 'user-1',
    displayName: '동현',
    nickname: null,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
    user: { username: 'donghyun', globalName: 'Donghyun', bot: false },
    displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
    ...overrides,
  } as unknown as GuildMember;
}

/**
 * private `logger` 스파이용 접근자. `as any` 대신 최소 구조만 드러내 no-explicit-any 를 피한다
 * — Nest `Logger` 는 런타임 private 이 아니라 TS 가시성만 제한하므로 구조 단언으로 안전하다.
 */
function loggerOf(handler: BotGuildCreateHandler): { error: unknown; warn: unknown } {
  return (handler as unknown as { logger: { error: unknown; warn: unknown } }).logger;
}

interface MakeGuildOptions {
  id: string;
  name: string;
  icon: string | null;
  fetchImpl?: Mock;
}

/** 길드 mock — id/name/icon + members.fetch 를 함께 갖는다 (clientReady/reconcileGuildDirectory 모두 사용). */
function makeGuild({ id, name, icon, fetchImpl }: MakeGuildOptions): Guild {
  const fetch =
    fetchImpl ??
    vi
      .fn()
      .mockResolvedValue(
        new Collection([[`${id}-user-1`, makeGuildMember({ id: `${id}-user-1` })]]),
      );
  return {
    id,
    name,
    icon,
    members: { fetch },
  } as unknown as Guild;
}

function makeClientWithGuilds(guilds: Guild[]): Client {
  return {
    guilds: { cache: new Collection(guilds.map((g) => [g.id, g])) },
  } as unknown as Client;
}

function makeDirectoryReconcileResult(
  overrides: Partial<GuildDirectoryReconcileResult> = {},
): GuildDirectoryReconcileResult {
  return { ok: true, upserted: 0, deactivated: 0, skipped: false, ...overrides };
}

describe('BotGuildCreateHandler', () => {
  let apiClient: {
    bulkUpsertGuildMembers: Mock;
    reconcileGuildMembers: Mock;
    healthCheck: Mock;
    reconcileGuildDirectory: Mock;
  };
  let syncHandler: BotGuildMemberSyncHandler;
  let createHandler: BotGuildCreateHandler;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;
  let existingGuild: Guild;
  let newGuild: Guild;

  beforeEach(() => {
    // 매 테스트마다 새 mock을 만든다 — 모듈 스코프에서 한 번만 만들면 vi.restoreAllMocks()가
    // vi.fn()의 mockResolvedValue 구현까지 지워버려(원본이 없는 mock은 restore가 reset과 동일)
    // 이후 테스트의 fetch가 undefined를 반환하는 오염이 발생한다.
    existingGuild = makeGuild({
      id: 'guild-existing',
      name: 'Existing Guild',
      icon: 'icon-existing',
    });
    newGuild = makeGuild({ id: 'guild-new', name: 'New Guild', icon: 'icon-new' });

    apiClient = {
      bulkUpsertGuildMembers: vi.fn().mockResolvedValue(undefined),
      reconcileGuildMembers: vi
        .fn()
        .mockResolvedValue({ ok: true, deactivated: 0, skipped: false }),
      healthCheck: vi.fn().mockResolvedValue(undefined),
      reconcileGuildDirectory: vi.fn().mockResolvedValue(makeDirectoryReconcileResult()),
    };

    // client 캐시에 기존 길드 + 신규 길드(guildCreate 이벤트 시점엔 이미 discord.js 가 캐시에
    // 추가해 둔 상태)를 함께 넣어, reconcileGuildDirectory가 "신규 1건"이 아니라 "캐시 전체"를
    // 전송하는지 검증할 수 있게 한다.
    const client = makeClientWithGuilds([existingGuild, newGuild]);

    syncHandler = new BotGuildMemberSyncHandler(
      client,
      apiClient as unknown as BotApiClientService,
    );
    createHandler = new BotGuildCreateHandler(syncHandler);

    loggerErrorSpy = vi
      .spyOn(loggerOf(createHandler) as never, 'error')
      .mockImplementation(() => undefined);
    loggerWarnSpy = vi
      .spyOn(loggerOf(createHandler) as never, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('guildCreate 시 reconcileGuildDirectory(디렉토리 기록 경로)가 호출된다', async () => {
    await createHandler.handleGuildCreate(newGuild);

    expect(apiClient.reconcileGuildDirectory).toHaveBeenCalledTimes(1);
  });

  it('디렉토리 기록(reconcileGuildDirectory)이 실패해도 멤버 동기화(syncGuild)는 수행된다', async () => {
    apiClient.reconcileGuildDirectory.mockRejectedValue(new Error('directory reconcile 500'));

    await createHandler.handleGuildCreate(newGuild);

    expect(apiClient.bulkUpsertGuildMembers).toHaveBeenCalledTimes(1);
    expect(apiClient.bulkUpsertGuildMembers).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-new' }),
    );
  });

  it('멤버 동기화(syncGuild)가 실패해도 디렉토리 기록(reconcileGuildDirectory)은 수행된다', async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error('gateway timeout'));
    const unreachableGuild = makeGuild({
      id: 'guild-unreachable',
      name: 'Unreachable Guild',
      icon: null,
      fetchImpl: failingFetch,
    });
    const client = makeClientWithGuilds([existingGuild, unreachableGuild]);
    syncHandler = new BotGuildMemberSyncHandler(
      client,
      apiClient as unknown as BotApiClientService,
    );
    createHandler = new BotGuildCreateHandler(syncHandler);
    loggerWarnSpy = vi
      .spyOn(loggerOf(createHandler) as never, 'warn')
      .mockImplementation(() => undefined);

    await createHandler.handleGuildCreate(unreachableGuild);

    expect(apiClient.reconcileGuildDirectory).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('initial sync failed or empty'),
    );
  });

  it('reconcileGuildDirectory 전송 페이로드는 신규 길드 1건이 아니라 클라이언트 캐시 전체다', async () => {
    await createHandler.handleGuildCreate(newGuild);

    expect(apiClient.reconcileGuildDirectory).toHaveBeenCalledWith({
      guilds: [
        { id: 'guild-existing', name: 'Existing Guild', icon: 'icon-existing' },
        { id: 'guild-new', name: 'New Guild', icon: 'icon-new' },
      ],
    });
  });

  it('두 작업 모두 성공하면 정상 완료되고 경고 로그를 남기지 않는다', async () => {
    await createHandler.handleGuildCreate(newGuild);

    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('봇이 참여 중인 길드가 신규 1개뿐이어도(첫 초대) 정상 동작한다', async () => {
    // 캐시 전체 = 신규 길드 1건뿐인 경우 — "캐시 전체 전송" 설계가 "신규 1건 전송"과
    // 우연히 형태가 같아지는 경계다. 이 경우에도 정상 동작함을 고정한다.
    const client = makeClientWithGuilds([newGuild]);
    syncHandler = new BotGuildMemberSyncHandler(
      client,
      apiClient as unknown as BotApiClientService,
    );
    createHandler = new BotGuildCreateHandler(syncHandler);
    loggerWarnSpy = vi
      .spyOn(loggerOf(createHandler) as never, 'warn')
      .mockImplementation(() => undefined);
    loggerErrorSpy = vi
      .spyOn(loggerOf(createHandler) as never, 'error')
      .mockImplementation(() => undefined);

    await createHandler.handleGuildCreate(newGuild);

    expect(apiClient.reconcileGuildDirectory).toHaveBeenCalledWith({
      guilds: [{ id: 'guild-new', name: 'New Guild', icon: 'icon-new' }],
    });
    expect(apiClient.bulkUpsertGuildMembers).toHaveBeenCalledTimes(1);
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('guildCreate가 연속으로 두 번 발생해도 각각 독립적으로 처리된다', async () => {
    // discord.js 게이트웨이 재전송 등으로 동일/별개 guildCreate가 짧은 간격으로 중복 도착해도
    // 핸들러에 상태 공유(메모이제이션 등)가 없어 매번 동일하게 처리돼야 한다.
    await createHandler.handleGuildCreate(newGuild);
    await createHandler.handleGuildCreate(newGuild);

    expect(apiClient.reconcileGuildDirectory).toHaveBeenCalledTimes(2);
    expect(apiClient.bulkUpsertGuildMembers).toHaveBeenCalledTimes(2);
    expect(
      apiClient.reconcileGuildDirectory.mock.calls.every(
        (call) => (call[0] as { guilds: unknown[] }).guilds.length === 2,
      ),
    ).toBe(true);
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });
});
