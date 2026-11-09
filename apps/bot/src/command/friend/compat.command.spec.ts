/**
 * CompatCommand 단위 테스트 — `/궁합`(`ship`) 랜덤 궁합 카드(F-COPRESENCE-036, UF-COPRESENCE-020, UC-08,
 * edge-cases §16, 계획 `random-compat-command.md` §2-F·§4).
 * `best-friend.command.spec.ts` 패턴(BotI18nService 실 로드 + 목 인터랙션) 준용.
 *
 * 핵심 가드:
 * - 응답 순서: 성공 = deferReply(공개) → editReply(카드), 거부·오류 = deferReply(공개) → deleteReply →
 *   followUp(ephemeral) (EC-CP-118 ⓑ — 공개 원본을 먼저 지워야 안내가 채널에 남지 않는다. 호출 순서 로그로 단언)
 * - 쿨다운은 카드 게시 성공 후에만 시작 — 카드 editReply 시점엔 0, 종료 후 > 0 으로 단언
 * - SDK 로 넘어가는 userId 는 어떤 분기에서도 interaction.user.id
 * - 문구는 i18n 키를 실제 로드한 ko/en 문자열 리터럴로 단언(`t` 목킹 금지)
 */
import 'reflect-metadata';

import { ParamType, ReflectMetadataProvider } from '@discord-nestjs/core';
import { Logger } from '@nestjs/common';
import type { BotApiClientService, CompatCardResponse } from '@onyu/bot-api-client';
import { MESSAGE_CODE } from '@onyu/shared';
import { AxiosError, type AxiosResponse } from 'axios';
import { AttachmentBuilder, type ChatInputCommandInteraction, type User } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { CompatCommand } from './compat.command';
import { CompatCommandDto } from './compat.dto';
import {
  COMPAT_USER_COOLDOWN_MS,
  getCompatCooldownRemainingMs,
  getCompatUserCooldownRemainingMs,
  resetCompatCooldown,
} from './compat-cooldown';

const GUILD_ID = 'guild-1';
const CHANNEL_ID = 'channel-1';
const USER_ID = 'user-1';
const PEER_ID = 'peer-1';
const COOLDOWN_KEY = `${GUILD_ID}:${CHANNEL_ID}`;
const USER_COOLDOWN_KEY = `${GUILD_ID}:${USER_ID}`;
const COOLDOWN_MS = 10_000;
const START_TIME = new Date('2026-11-03T00:00:00.000Z');

const KO = {
  guildOnly: '서버에서만 사용 가능한 명령어입니다.',
  botTarget: '봇과는 궁합을 볼 수 없어요.',
  nonMember: '상대가 이 서버의 멤버가 아니에요.',
  error: '궁합 카드를 만들지 못했어요. 잠시 후 다시 시도해주세요.',
} as const;

/** 성공 흐름의 호출 순서 */
const POSTED_ORDER = ['defer', 'edit:card'];

/** 거부·오류 흐름의 호출 순서 — 공개 원본 삭제 후 ephemeral 안내 */
function privateNoticeOrder(content: string): string[] {
  return ['defer', 'delete', `followUp:${content}`];
}

function cooldownText(seconds: number): string {
  return `이 채널에서 방금 궁합을 봤어요. ${seconds}초 후 다시 시도해주세요.`;
}

function userCooldownText(seconds: number): string {
  return `방금 궁합을 봤어요. ${seconds}초 후 다시 시도해주세요.`;
}

/** 실행자만 바꾼 interaction override — 실행자 쿨다운에 걸리지 않게 할 때 쓴다. */
function otherUser(id: string): Record<string, unknown> {
  return {
    user: {
      id,
      displayName: `${id}-global`,
      displayAvatarURL: vi.fn().mockReturnValue(`https://cdn/${id}.png`),
    },
  };
}

interface OptionsMock {
  getUser: Mock;
  getMember: Mock;
}

function makePeerUser(id: string, overrides: Record<string, unknown> = {}): User {
  return {
    id,
    bot: false,
    displayName: `peer-global-${id}`,
    displayAvatarURL: vi.fn().mockReturnValue(`https://cdn/peer-${id}.png`),
    ...overrides,
  } as unknown as User;
}

function makeOptions(peer: User, member: Record<string, unknown> | null): OptionsMock {
  return {
    getUser: vi.fn().mockReturnValue(peer),
    getMember: vi.fn().mockReturnValue(member),
  };
}

interface InteractionBundle {
  interaction: ChatInputCommandInteraction;
  /** 호출 순서 로그 — `defer` / `edit:card` / `edit:<content>` / `followUp:<content>` / `delete` / `reply:<content>` */
  order: string[];
  /** 카드 editReply 시점의 채널 쿨다운 남은 ms */
  cooldownAt: { edit?: number };
}

function makeInteraction(
  options: OptionsMock,
  overrides: Record<string, unknown> = {},
): InteractionBundle {
  const order: string[] = [];
  const cooldownAt: InteractionBundle['cooldownAt'] = {};
  const interaction = {
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    locale: 'ko',
    deferred: false,
    replied: false,
    user: {
      id: USER_ID,
      displayName: 'Alice-global',
      displayAvatarURL: vi.fn().mockReturnValue('https://cdn/self.png'),
    },
    member: { displayName: 'AliceNick' },
    options,
    deferReply: vi.fn(function (this: { deferred: boolean }) {
      order.push('defer');
      this.deferred = true;
      return Promise.resolve(undefined);
    }),
    editReply: vi.fn((arg: { content?: string; files?: unknown[] }) => {
      order.push(arg.files ? 'edit:card' : `edit:${arg.content ?? ''}`);
      cooldownAt.edit = getCompatCooldownRemainingMs(COOLDOWN_KEY);
      return Promise.resolve(undefined);
    }),
    followUp: vi.fn((arg: { content?: string }) => {
      order.push(`followUp:${arg.content ?? ''}`);
      return Promise.resolve(undefined);
    }),
    deleteReply: vi.fn(() => {
      order.push('delete');
      return Promise.resolve(undefined);
    }),
    reply: vi.fn((arg: { content?: string }) => {
      order.push(`reply:${arg.content ?? ''}`);
      return Promise.resolve(undefined);
    }),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, order, cooldownAt };
}

function cardResponse(overrides: Partial<CompatCardResponse> = {}): CompatCardResponse {
  return {
    ok: true,
    data: { imageBase64: Buffer.from('compat-png').toString('base64') },
    ...overrides,
  } as CompatCardResponse;
}

function peerHiddenError(shape: 'top' | 'nested' = 'top'): AxiosError {
  const error = new AxiosError('hidden');
  // as 단언 사유: 테스트용 최소 응답 — 판별 헬퍼가 status/data 만 읽는다.
  error.response = {
    status: 400,
    data:
      shape === 'top'
        ? { message: 'hidden', code: MESSAGE_CODE.CO_PRESENCE_PEER_HIDDEN }
        : { message: { code: MESSAGE_CODE.CO_PRESENCE_PEER_HIDDEN } },
  } as AxiosResponse;
  return error;
}

function httpError(status: number, data: unknown): AxiosError {
  const error = new AxiosError(`http ${status}`);
  // as 단언 사유: 테스트용 최소 응답.
  error.response = { status, data } as AxiosResponse;
  return error;
}

describe('CompatCommand', () => {
  let command: CompatCommand;
  let apiClient: { getCompatCard: Mock };
  let i18n: BotI18nService;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START_TIME);
    resetCompatCooldown();
    // 오류 경로의 로그 출력이 테스트 출력을 오염시키지 않게 한다(호출 여부는 일부 케이스에서 단언).
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    apiClient = { getCompatCard: vi.fn().mockResolvedValue(cardResponse()) };
    i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new CompatCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  afterEach(() => {
    resetCompatCooldown();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function run(bundle: InteractionBundle): Promise<void> {
    await command.onCompat(bundle.interaction, new CompatCommandDto());
  }

  // ─── 커맨드 정의(VP-08-14) ───────────────────────────────────────────────────

  describe('커맨드 정의 메타데이터', () => {
    const metadataProvider = new ReflectMetadataProvider();

    it('name 은 ship, ko 이름은 궁합이다', () => {
      const meta = metadataProvider.getCommandDecoratorMetadata(CompatCommand.prototype) as {
        name?: string;
        nameLocalizations?: Record<string, string>;
      };

      expect(meta.name).toBe('ship');
      expect(meta.nameLocalizations).toEqual({ ko: '궁합' });
    });

    it('옵션은 peer 하나이고 USER 타입·required·ko 이름 상대다', () => {
      const optionKeys = Object.keys(new CompatCommandDto());
      const meta = metadataProvider.getParamDecoratorMetadata(CompatCommandDto, 'peer') as {
        name?: string;
        type?: ParamType;
        required?: boolean;
        nameLocalizations?: Record<string, string>;
      };

      expect(optionKeys).toEqual(['peer']);
      expect(meta.name).toBe('peer');
      expect(meta.type).toBe(ParamType.USER);
      expect(meta.required).toBe(true);
      expect(meta.nameLocalizations).toEqual({ ko: '상대' });
    });
  });

  // ─── 1차 판정(API 미호출) ────────────────────────────────────────────────────

  describe('1차 판정 — API 미호출', () => {
    it('DM(guildId 없음)이면 errors.guildOnly 를 ephemeral 로 응답하고 SDK 를 호출하지 않는다', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), { guildId: null });

      await run(bundle);

      expect(bundle.interaction.reply).toHaveBeenCalledTimes(1);
      expect(bundle.interaction.reply).toHaveBeenCalledWith({
        content: KO.guildOnly,
        ephemeral: true,
      });
      expect(apiClient.getCompatCard).not.toHaveBeenCalled();
      expect(bundle.interaction.deferReply).not.toHaveBeenCalled();
      expect(bundle.interaction.followUp).not.toHaveBeenCalled();
    });

    it('봇을 지정하면 compatBotTarget 을 ephemeral 로 1건 응답하고 SDK·defer·공개 게시가 없다', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser('bot-1', { bot: true }), {}));

      await run(bundle);

      expect(bundle.interaction.reply).toHaveBeenCalledTimes(1);
      expect(bundle.interaction.reply).toHaveBeenCalledWith({
        content: KO.botTarget,
        ephemeral: true,
      });
      expect(apiClient.getCompatCard).not.toHaveBeenCalled();
      expect(bundle.interaction.deferReply).not.toHaveBeenCalled();
      expect(bundle.interaction.followUp).not.toHaveBeenCalled();
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
    });

    it('길드 비멤버(getMember null)를 지정하면 compatNonMember 를 ephemeral 로 응답하고 SDK 를 호출하지 않는다', async () => {
      const options = makeOptions(makePeerUser(PEER_ID), null);
      const bundle = makeInteraction(options);

      await run(bundle);

      expect(options.getMember).toHaveBeenCalledWith('peer');
      expect(bundle.interaction.reply).toHaveBeenCalledTimes(1);
      expect(bundle.interaction.reply).toHaveBeenCalledWith({
        content: KO.nonMember,
        ephemeral: true,
      });
      expect(apiClient.getCompatCard).not.toHaveBeenCalled();
      expect(bundle.interaction.deferReply).not.toHaveBeenCalled();
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
    });

    it('봇 검사가 비멤버 검사보다 먼저다(봇이면서 getMember null 이어도 compatBotTarget)', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser('bot-1', { bot: true }), null));

      await run(bundle);

      expect(bundle.interaction.reply).toHaveBeenCalledWith({
        content: KO.botTarget,
        ephemeral: true,
      });
    });

    it('en 로케일이면 영어 문구로 안내한다', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser('bot-1', { bot: true }), {}), {
        locale: 'en',
      });

      await run(bundle);

      expect(bundle.interaction.reply).toHaveBeenCalledWith({
        content: "You can't check ship scores with bots.",
        ephemeral: true,
      });
    });

    it.each([
      ['DM', { guildId: null }, {}],
      ['봇 지정', {}, { bot: true }],
    ])(
      '%s 분기에서도 SDK 호출이 0건이다(userId 오전달 불가)',
      async (_name, ixOverride, peerOverride) => {
        const bundle = makeInteraction(
          makeOptions(makePeerUser(PEER_ID, peerOverride as Record<string, unknown>), {}),
          ixOverride as Record<string, unknown>,
        );

        await run(bundle);

        expect(apiClient.getCompatCard).not.toHaveBeenCalled();
      },
    );
  });

  // ─── 쿨다운 ─────────────────────────────────────────────────────────────────

  describe('채널 쿨다운(EC-CP-117)', () => {
    it('쿨다운 중이면 compatCooldown(올림 초)을 ephemeral 로 응답하고 SDK 를 호출하지 않는다', async () => {
      const first = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      await run(first);
      vi.advanceTimersByTime(3_500); // 남은 6500ms → 올림 7초
      apiClient.getCompatCard.mockClear();
      const second = makeInteraction(makeOptions(makePeerUser('peer-2'), {}));

      await run(second);

      expect(second.interaction.reply).toHaveBeenCalledTimes(1);
      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: cooldownText(7),
        ephemeral: true,
      });
      expect(apiClient.getCompatCard).not.toHaveBeenCalled();
      expect(second.interaction.deferReply).not.toHaveBeenCalled();
      expect(second.interaction.followUp).not.toHaveBeenCalled();
    });

    it('게시 직후(남은 10000ms)에는 10초로 안내한다', async () => {
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      const second = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(second);

      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: cooldownText(10),
        ephemeral: true,
      });
    });

    it('남은 시간이 1ms 여도 1초로 안내한다(올림)', async () => {
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      vi.advanceTimersByTime(COOLDOWN_MS - 1);
      const second = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(second);

      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: cooldownText(1),
        ephemeral: true,
      });
    });

    it('10초가 지나면 같은 채널에서 다시 게시할 수 있다', async () => {
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      vi.advanceTimersByTime(COOLDOWN_MS);
      // 같은 실행자는 30초 실행자 쿨다운에 걸리므로 다른 실행자로 채널 쿨다운 만료만 검증한다.
      const second = makeInteraction(makeOptions(makePeerUser('peer-2'), {}), otherUser('user-2'));

      await run(second);

      expect(apiClient.getCompatCard).toHaveBeenCalledTimes(2);
      expect(second.order).toEqual(POSTED_ORDER);
    });

    it('다른 채널의 쿨다운은 독립이다', async () => {
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      const otherChannel = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        channelId: 'channel-2',
        ...otherUser('user-2'),
      });

      await run(otherChannel);

      expect(otherChannel.interaction.reply).not.toHaveBeenCalled();
      expect(otherChannel.order).toEqual(POSTED_ORDER);
      expect(apiClient.getCompatCard).toHaveBeenCalledTimes(2);
    });

    it('같은 channelId 라도 다른 길드면 독립이다', async () => {
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      const otherGuild = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        guildId: 'guild-2',
      });

      await run(otherGuild);

      expect(otherGuild.interaction.reply).not.toHaveBeenCalled();
      expect(otherGuild.order).toEqual(POSTED_ORDER);
    });

    it('같은 채널 동시 실행은 1건만 게시하고 나머지는 쿨다운 전체(10초)로 안내한다', async () => {
      let resolveCard: (value: CompatCardResponse) => void = () => undefined;
      apiClient.getCompatCard.mockReturnValueOnce(
        new Promise<CompatCardResponse>((resolve) => {
          resolveCard = resolve;
        }),
      );
      const first = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      const second = makeInteraction(makeOptions(makePeerUser('peer-2'), {}));

      const firstRun = run(first);
      await vi.waitFor(() => expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1));
      await run(second);
      resolveCard(cardResponse());
      await firstRun;

      expect(first.order).toEqual(POSTED_ORDER);
      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: cooldownText(10),
        ephemeral: true,
      });
      expect(second.interaction.deferReply).not.toHaveBeenCalled();
      expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1);
    });

    it('진행 중이던 실행이 실패하면 슬롯이 반납돼 곧바로 다시 실행할 수 있다', async () => {
      apiClient.getCompatCard.mockResolvedValueOnce({ ok: false });
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      const retry = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(retry);

      expect(retry.interaction.reply).not.toHaveBeenCalled();
      expect(retry.order).toEqual(POSTED_ORDER);
    });

    it('쿨다운 판정은 1차 판정(봇 지정) 뒤다 — 쿨다운 중에도 봇 지정이면 봇 안내를 받는다', async () => {
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      const bot = makeInteraction(makeOptions(makePeerUser('bot-1', { bot: true }), {}));

      await run(bot);

      expect(bot.interaction.reply).toHaveBeenCalledWith({
        content: KO.botTarget,
        ephemeral: true,
      });
    });
  });

  // ─── 실행자 쿨다운(D9, 30초) ────────────────────────────────────────────────

  describe('실행자 쿨다운(D9 — 길드+실행자 30초)', () => {
    async function postOnce(): Promise<void> {
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      apiClient.getCompatCard.mockClear();
    }

    it('카드 게시 성공 후 실행자 쿨다운이 30초로 시작된다', async () => {
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));

      expect(getCompatUserCooldownRemainingMs(USER_COOLDOWN_KEY)).toBe(COMPAT_USER_COOLDOWN_MS);
    });

    it('쿨다운 중 같은 실행자가 다른 채널에서 실행하면 API·defer 없이 ephemeral 안내(올림 초)를 받는다', async () => {
      await postOnce();
      vi.advanceTimersByTime(12_500); // 남은 17500ms → 올림 18초
      const second = makeInteraction(makeOptions(makePeerUser('peer-2'), {}), {
        channelId: 'channel-2',
      });

      await run(second);

      expect(second.interaction.reply).toHaveBeenCalledTimes(1);
      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: userCooldownText(18),
        ephemeral: true,
      });
      expect(apiClient.getCompatCard).not.toHaveBeenCalled();
      expect(second.interaction.deferReply).not.toHaveBeenCalled();
      expect(second.interaction.followUp).not.toHaveBeenCalled();
      expect(second.interaction.deleteReply).not.toHaveBeenCalled();
    });

    it('게시 직후에는 30초로 안내한다', async () => {
      await postOnce();
      const second = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        channelId: 'channel-2',
      });

      await run(second);

      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: userCooldownText(30),
        ephemeral: true,
      });
    });

    it('남은 시간이 1ms 여도 1초로 안내한다(올림)', async () => {
      await postOnce();
      vi.advanceTimersByTime(COMPAT_USER_COOLDOWN_MS - 1);
      const second = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        channelId: 'channel-2',
      });

      await run(second);

      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: userCooldownText(1),
        ephemeral: true,
      });
    });

    it('채널 쿨다운이 끝난 뒤(10초 후)에도 같은 채널에서 같은 실행자는 막힌다', async () => {
      await postOnce();
      vi.advanceTimersByTime(COOLDOWN_MS);
      const second = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(second);

      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: userCooldownText(20),
        ephemeral: true,
      });
      expect(apiClient.getCompatCard).not.toHaveBeenCalled();
    });

    it('다른 실행자는 다른 채널에서 통과한다', async () => {
      await postOnce();
      const other = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        channelId: 'channel-2',
        ...otherUser('user-2'),
      });

      await run(other);

      expect(other.interaction.reply).not.toHaveBeenCalled();
      expect(other.order).toEqual(POSTED_ORDER);
      expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1);
      expect(apiClient.getCompatCard).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-2' }),
      );
    });

    it('같은 실행자라도 다른 길드면 독립이다', async () => {
      await postOnce();
      const otherGuild = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        guildId: 'guild-2',
      });

      await run(otherGuild);

      expect(otherGuild.interaction.reply).not.toHaveBeenCalled();
      expect(otherGuild.order).toEqual(POSTED_ORDER);
    });

    it('30초가 지나면 같은 실행자가 다시 게시할 수 있다', async () => {
      await postOnce();
      vi.advanceTimersByTime(COMPAT_USER_COOLDOWN_MS);
      const second = makeInteraction(makeOptions(makePeerUser('peer-2'), {}));

      await run(second);

      expect(second.interaction.reply).not.toHaveBeenCalled();
      expect(second.order).toEqual(POSTED_ORDER);
      expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1);
    });

    it('채널 쿨다운과 실행자 쿨다운이 동시에 걸려 있으면 채널 안내가 우선한다', async () => {
      await postOnce();
      vi.advanceTimersByTime(3_000); // 채널 7초, 실행자 27초
      const second = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(second);

      expect(second.interaction.reply).toHaveBeenCalledTimes(1);
      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: cooldownText(7),
        ephemeral: true,
      });
      expect(apiClient.getCompatCard).not.toHaveBeenCalled();
    });

    it('1차 판정(봇 지정)이 실행자 쿨다운보다 먼저다', async () => {
      await postOnce();
      const bot = makeInteraction(makeOptions(makePeerUser('bot-1', { bot: true }), {}), {
        channelId: 'channel-2',
      });

      await run(bot);

      expect(bot.interaction.reply).toHaveBeenCalledWith({
        content: KO.botTarget,
        ephemeral: true,
      });
    });

    it('쿨다운에 막힌 시도는 실행자 쿨다운을 연장하지 않는다', async () => {
      await postOnce();
      vi.advanceTimersByTime(10_000);
      await run(
        makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), { channelId: 'channel-2' }),
      );

      expect(getCompatUserCooldownRemainingMs(USER_COOLDOWN_KEY)).toBe(20_000);
    });

    it('ok:false 실패는 실행자 쿨다운을 소모하지 않아 곧바로 다시 실행할 수 있다', async () => {
      apiClient.getCompatCard.mockResolvedValueOnce({ ok: false });
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      expect(getCompatUserCooldownRemainingMs(USER_COOLDOWN_KEY)).toBe(0);
      const retry = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        channelId: 'channel-2',
      });

      await run(retry);

      expect(retry.interaction.reply).not.toHaveBeenCalled();
      expect(retry.order).toEqual(POSTED_ORDER);
    });

    it('SDK reject·opt-out 거부·editReply 실패도 실행자 쿨다운을 소모하지 않는다', async () => {
      apiClient.getCompatCard.mockRejectedValueOnce(peerHiddenError());
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      expect(getCompatUserCooldownRemainingMs(USER_COOLDOWN_KEY)).toBe(0);

      apiClient.getCompatCard.mockRejectedValueOnce(new Error('boom'));
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      expect(getCompatUserCooldownRemainingMs(USER_COOLDOWN_KEY)).toBe(0);

      const editFail = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      (editFail.interaction.editReply as Mock).mockRejectedValueOnce(new Error('Missing'));
      await run(editFail);
      expect(getCompatUserCooldownRemainingMs(USER_COOLDOWN_KEY)).toBe(0);
    });

    it('1차 판정 거부(봇·비멤버)와 deferReply 실패는 실행자 쿨다운을 소모하지 않는다', async () => {
      await run(makeInteraction(makeOptions(makePeerUser('bot-1', { bot: true }), {})));
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), null)));
      const deferFail = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      (deferFail.interaction.deferReply as Mock).mockRejectedValue(
        new Error('Unknown interaction'),
      );
      await run(deferFail);

      expect(getCompatUserCooldownRemainingMs(USER_COOLDOWN_KEY)).toBe(0);
    });

    it('같은 실행자가 다른 채널에서 동시에 실행하면 1건만 게시하고 나머지는 실행자 쿨다운 전체(30초)로 안내한다', async () => {
      let resolveCard: (value: CompatCardResponse) => void = () => undefined;
      apiClient.getCompatCard.mockReturnValueOnce(
        new Promise<CompatCardResponse>((resolve) => {
          resolveCard = resolve;
        }),
      );
      const first = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      const second = makeInteraction(makeOptions(makePeerUser('peer-2'), {}), {
        channelId: 'channel-2',
      });

      const firstRun = run(first);
      await vi.waitFor(() => expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1));
      await run(second);
      resolveCard(cardResponse());
      await firstRun;

      expect(first.order).toEqual(POSTED_ORDER);
      expect(second.interaction.reply).toHaveBeenCalledWith({
        content: userCooldownText(30),
        ephemeral: true,
      });
      expect(second.interaction.deferReply).not.toHaveBeenCalled();
      expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1);
    });

    it('실행자 슬롯에 막힌 시도는 그 채널 슬롯을 점유하지 않고, 실패한 실행은 실행자 슬롯을 반납한다', async () => {
      let resolveCard: (value: CompatCardResponse) => void = () => undefined;
      apiClient.getCompatCard.mockReturnValueOnce(
        new Promise<CompatCardResponse>((resolve) => {
          resolveCard = resolve;
        }),
      );
      const firstRun = run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      await vi.waitFor(() => expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1));
      await run(
        makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), { channelId: 'channel-2' }),
      );
      resolveCard({ ok: false } as CompatCardResponse);
      await firstRun;

      const otherUserSameChannel = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        channelId: 'channel-2',
        ...otherUser('user-2'),
      });
      await run(otherUserSameChannel);
      const retry = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      await run(retry);

      expect(otherUserSameChannel.interaction.reply).not.toHaveBeenCalled();
      expect(retry.interaction.reply).not.toHaveBeenCalled();
    });

    it('실행자 쿨다운으로 막힌 시도는 채널 슬롯을 점유하지 않는다', async () => {
      await postOnce();
      await run(
        makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), { channelId: 'channel-2' }),
      );
      const other = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), {
        channelId: 'channel-2',
        ...otherUser('user-2'),
      });

      await run(other);

      expect(other.interaction.reply).not.toHaveBeenCalled();
      expect(other.order).toEqual(POSTED_ORDER);
    });
  });

  // ─── 정상 흐름 ──────────────────────────────────────────────────────────────

  describe('정상 흐름', () => {
    it('공개 deferReply → editReply(카드) 로 원본 응답이 곧 카드다(실행자·커맨드 헤더 유지 — 삭제·followUp 없음)', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(bundle);

      expect(bundle.order).toEqual(POSTED_ORDER);
      expect(bundle.interaction.deferReply).toHaveBeenCalledWith();
      expect(bundle.interaction.deleteReply).not.toHaveBeenCalled();
      expect(bundle.interaction.followUp).not.toHaveBeenCalled();
      expect(bundle.interaction.reply).not.toHaveBeenCalled();
    });

    it('카드 editReply 는 첨부 1개(compat.png)만 담고 content·components 가 없다', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(bundle);

      const arg = (bundle.interaction.editReply as Mock).mock.calls[0][0] as {
        files: AttachmentBuilder[];
        content?: unknown;
        components?: unknown;
      };
      expect(arg.files).toHaveLength(1);
      expect(arg.files[0]).toBeInstanceOf(AttachmentBuilder);
      expect(arg.files[0].name).toBe('compat.png');
      expect(Buffer.from(arg.files[0].attachment as Buffer).toString()).toBe('compat-png');
      expect(arg).not.toHaveProperty('content');
      expect(arg).not.toHaveProperty('components');
    });

    it('쿨다운은 카드 게시 성공 후에 시작된다(editReply 시점 0, 종료 후 > 0)', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(bundle);

      expect(bundle.cooldownAt.edit).toBe(0);
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(COOLDOWN_MS);
    });

    it('SDK 에는 userId=실행자, peerId=상대, 길드 닉네임·아바타(png 128)·로케일을 전달한다', async () => {
      const peer = makePeerUser(PEER_ID);
      const bundle = makeInteraction(makeOptions(peer, { displayName: 'PeerNick' }));

      await run(bundle);

      expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1);
      expect(apiClient.getCompatCard).toHaveBeenCalledWith({
        guildId: GUILD_ID,
        userId: USER_ID,
        peerId: PEER_ID,
        selfDisplayName: 'AliceNick',
        selfAvatarUrl: 'https://cdn/self.png',
        peerDisplayName: 'PeerNick',
        peerAvatarUrl: `https://cdn/peer-${PEER_ID}.png`,
        locale: 'ko',
      });
      const userMock = bundle.interaction.user.displayAvatarURL as Mock;
      expect(userMock).toHaveBeenCalledWith({ extension: 'png', size: 128 });
      expect(peer.displayAvatarURL as Mock).toHaveBeenCalledWith({ extension: 'png', size: 128 });
    });

    it('길드 닉네임이 없으면 전역 displayName 으로 폴백한다(본인·상대 모두)', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), { member: null });

      await run(bundle);

      expect(apiClient.getCompatCard).toHaveBeenCalledWith(
        expect.objectContaining({
          selfDisplayName: 'Alice-global',
          peerDisplayName: `peer-global-${PEER_ID}`,
        }),
      );
    });

    it('interaction.locale 이 en 이면 SDK 로 locale=en 을 전달한다', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}), { locale: 'en' });

      await run(bundle);

      expect(apiClient.getCompatCard).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'en' }),
      );
    });

    it('SDK 의 userId 는 상대가 누구든 항상 interaction.user.id 다', async () => {
      for (const peerId of ['peer-a', 'peer-b', 'peer-c']) {
        resetCompatCooldown();
        apiClient.getCompatCard.mockClear();
        const bundle = makeInteraction(makeOptions(makePeerUser(peerId), {}));

        await run(bundle);

        const arg = apiClient.getCompatCard.mock.calls[0][0] as { userId: string; peerId: string };
        expect(arg.userId).toBe(USER_ID);
        expect(arg.peerId).toBe(peerId);
      }
    });
  });

  // ─── 본인 지정 ──────────────────────────────────────────────────────────────

  describe('본인 지정', () => {
    it('본인을 지정하면 getMember 가 null 이어도 거부하지 않고 SDK 를 1회 호출한다(userId === peerId)', async () => {
      const self = makePeerUser(USER_ID, { displayName: 'Alice-global' });
      const options = makeOptions(self, null);
      const bundle = makeInteraction(options);

      await run(bundle);

      expect(bundle.interaction.reply).not.toHaveBeenCalled();
      expect(apiClient.getCompatCard).toHaveBeenCalledTimes(1);
      const arg = apiClient.getCompatCard.mock.calls[0][0] as { userId: string; peerId: string };
      expect(arg.userId).toBe(USER_ID);
      expect(arg.peerId).toBe(USER_ID);
    });

    it('본인 지정이면 상대 표시명은 본인 길드 닉네임을 재사용한다', async () => {
      const self = makePeerUser(USER_ID, { displayName: 'Alice-global' });
      const bundle = makeInteraction(makeOptions(self, { displayName: 'should-not-be-used' }));

      await run(bundle);

      expect(apiClient.getCompatCard).toHaveBeenCalledWith(
        expect.objectContaining({
          selfDisplayName: 'AliceNick',
          peerDisplayName: 'AliceNick',
        }),
      );
    });

    it('본인 지정도 공개 카드로 게시하고 쿨다운을 시작한다', async () => {
      const self = makePeerUser(USER_ID);
      const bundle = makeInteraction(makeOptions(self, null));

      await run(bundle);

      expect(bundle.order).toEqual(POSTED_ORDER);
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(COOLDOWN_MS);
    });

    it('본인 지정이면 봇 계정 판정이 없고 비멤버 안내도 나가지 않는다', async () => {
      const self = makePeerUser(USER_ID);
      const bundle = makeInteraction(makeOptions(self, null));

      await run(bundle);

      expect(bundle.interaction.reply).not.toHaveBeenCalled();
    });
  });

  // ─── opt-out(EC-CP-112, D8 (b)) ─────────────────────────────────────────────

  describe('상대 opt-out — 400 CO_PRESENCE_PEER_HIDDEN 도 일반 오류로 처리(D8 (b))', () => {
    it.each([
      ['최상위 code', 'top' as const],
      ['message.code 중첩', 'nested' as const],
    ])(
      '%s 로 거절돼도 전용 분기 없이 공개 원본을 지운 뒤 compatError 를 ephemeral 로 안내하고 쿨다운이 없다',
      async (_name, shape) => {
        apiClient.getCompatCard.mockRejectedValue(peerHiddenError(shape));
        const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

        await run(bundle);

        expect(bundle.order).toEqual(privateNoticeOrder(KO.error));
        expect(bundle.interaction.followUp).toHaveBeenCalledWith({
          content: KO.error,
          ephemeral: true,
        });
        expect(bundle.order).not.toContain('followUp:이 멤버와의 궁합 카드는 표시할 수 없어요.');
        expect(bundle.interaction.editReply).not.toHaveBeenCalled();
        expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
        expect(getCompatUserCooldownRemainingMs(USER_COOLDOWN_KEY)).toBe(0);
      },
    );

    it('opt-out 거절도 다른 SDK 오류와 같이 오류 로그(error)를 남긴다', async () => {
      apiClient.getCompatCard.mockRejectedValue(peerHiddenError());
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(bundle);

      expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 오류 ───────────────────────────────────────────────────────────────────

  describe('오류 — 공개 원본 삭제·ephemeral 안내·쿨다운 미소모', () => {
    it('ok:false 이면 공개 원본을 지우고 compatError 를 ephemeral 로 안내하며 쿨다운을 소모하지 않는다', async () => {
      apiClient.getCompatCard.mockResolvedValue({ ok: false });
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(bundle);

      expect(bundle.order).toEqual(privateNoticeOrder(KO.error));
      expect(bundle.interaction.followUp).toHaveBeenCalledWith({
        content: KO.error,
        ephemeral: true,
      });
      expect(bundle.interaction.editReply).not.toHaveBeenCalled();
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
    });

    it('ok:true 라도 data 가 없으면 compatError 로 처리한다(텍스트 폴백 없음)', async () => {
      apiClient.getCompatCard.mockResolvedValue({ ok: true });
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(bundle);

      expect(bundle.order).toEqual(privateNoticeOrder(KO.error));
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
    });

    it.each([
      ['네트워크 오류', new Error('ECONNREFUSED')],
      ['401', httpError(401, { message: 'Unauthorized' })],
      ['비 opt-out 400', httpError(400, { message: 'bad', code: 'SOMETHING_ELSE' })],
    ])(
      'SDK 가 %s 로 reject 되면 오류 안내 1건만 ephemeral 로 보내고 공개 게시·쿨다운이 없다',
      async (_name, error) => {
        apiClient.getCompatCard.mockRejectedValue(error);
        const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

        await run(bundle);

        expect(bundle.order).toEqual(privateNoticeOrder(KO.error));
        expect(bundle.interaction.editReply).not.toHaveBeenCalled();
        expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
      },
    );

    it('카드 editReply 가 실패하면 공개 원본을 지우고 compatError 를 ephemeral 로 안내하며 쿨다운을 소모하지 않는다', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      (bundle.interaction.editReply as Mock).mockRejectedValueOnce(
        new Error('Missing Permissions'),
      );

      await run(bundle);

      expect(bundle.order).toEqual(privateNoticeOrder(KO.error));
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
    });

    it('deferReply 가 실패하면 SDK 를 호출하지 않고 ephemeral reply 로 compatError 를 안내한다', async () => {
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      (bundle.interaction.deferReply as Mock).mockRejectedValue(new Error('Unknown interaction'));

      await run(bundle);

      expect(apiClient.getCompatCard).not.toHaveBeenCalled();
      expect(bundle.interaction.reply).toHaveBeenCalledWith({
        content: KO.error,
        ephemeral: true,
      });
      expect(bundle.interaction.followUp).not.toHaveBeenCalled();
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
    });

    it('오류 후 같은 채널에서 곧바로 다시 시도할 수 있다(쿨다운 미소모)', async () => {
      apiClient.getCompatCard.mockRejectedValueOnce(new Error('boom'));
      await run(makeInteraction(makeOptions(makePeerUser(PEER_ID), {})));
      const retry = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));

      await run(retry);

      expect(retry.interaction.reply).not.toHaveBeenCalled();
      expect(retry.order).toEqual(POSTED_ORDER);
    });
  });

  // ─── 비공개 안내 경로의 실패 흡수 ───────────────────────────────────────────

  describe('비공개 안내 실패 흡수', () => {
    it('공개 원본 deleteReply 가 reject 돼도 던지지 않고 ephemeral 안내는 보내며 warn 만 남긴다', async () => {
      apiClient.getCompatCard.mockRejectedValue(peerHiddenError());
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      (bundle.interaction.deleteReply as Mock).mockRejectedValue(new Error('Unknown Message'));

      await expect(run(bundle)).resolves.toBeUndefined();

      expect(bundle.interaction.followUp).toHaveBeenCalledWith({
        content: KO.error,
        ephemeral: true,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('ephemeral 안내 followUp 이 reject 돼도 던지지 않고 warn 만 남긴다', async () => {
      apiClient.getCompatCard.mockResolvedValue({ ok: false });
      const bundle = makeInteraction(makeOptions(makePeerUser(PEER_ID), {}));
      (bundle.interaction.followUp as Mock).mockRejectedValue(new Error('Unknown Webhook'));

      await expect(run(bundle)).resolves.toBeUndefined();

      expect(bundle.interaction.deleteReply).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(getCompatCooldownRemainingMs(COOLDOWN_KEY)).toBe(0);
    });
  });
});
