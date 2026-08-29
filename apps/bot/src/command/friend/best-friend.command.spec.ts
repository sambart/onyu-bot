/**
 * BestFriendCommand 단위 테스트 — `/친한친구` 커맨드의 무옵션(개인 TOP5)/`상대` 옵션(듀오 케미
 * 카드) 분기를 검증한다(F-COPRESENCE-014·029, 계획 §6). `me.command.spec.ts` 패턴
 * (BotI18nService 실 로드 + 목 인터랙션) 준용. `apps/bot/src/command/friend/`에 spec 파일이
 * 없어(실측) 본 파일이 최초 신규 파일이다.
 *
 * 핵심 회귀 가드(계획 §6 "P0 회귀 가드"):
 * - 무옵션 호출은 deferReply()를 **인자 없이**(공개 응답) 호출해야 한다 — 기존 F-COPRESENCE-014
 *   동작이 `상대` 옵션 추가로 회귀하지 않는지 감시한다.
 * - §2-F 불변식: 어떤 분기에서도 SDK로 넘어가는 userId는 항상 interaction.user.id다.
 */
import type {
  BestFriendCardResponse,
  BotApiClientService,
  DuoChemistryCardResponse,
} from '@onyu/bot-api-client';
import type { ChatInputCommandInteraction, GuildMember, User } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BestFriendCommand } from './best-friend.command';
import { BestFriendCommandDto } from './best-friend.dto';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';

function makeOptions(
  peer: User | null,
  memberOverride: Record<string, unknown> | null = peer ? {} : null,
): { getUser: Mock; getMember: Mock } {
  return {
    getUser: vi.fn().mockReturnValue(peer),
    getMember: vi.fn().mockReturnValue(memberOverride),
  };
}

function makePeerUser(id: string, overrides: Record<string, unknown> = {}): User {
  return {
    id,
    bot: false,
    displayName: `peer-${id}`,
    displayAvatarURL: () => `https://cdn/peer-${id}.png`,
    ...overrides,
  } as unknown as User;
}

function makeInteraction(overrides: Record<string, unknown> = {}): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    locale: 'ko',
    user: { id: USER_ID, displayName: 'Alice', displayAvatarURL: () => 'https://cdn/avatar.png' },
    member: { displayName: 'Alice' } as unknown as GuildMember,
    options: makeOptions(null),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function bestFriendResponse(
  overrides: Partial<BestFriendCardResponse> = {},
): BestFriendCardResponse {
  return {
    ok: true,
    days: 90,
    data: { imageBase64: Buffer.from('personal-png').toString('base64') },
    ...overrides,
  };
}

function duoResponse(overrides: Partial<DuoChemistryCardResponse> = {}): DuoChemistryCardResponse {
  return {
    ok: true,
    days: 90,
    data: { imageBase64: Buffer.from('duo-png').toString('base64') },
    ...overrides,
  };
}

describe('BestFriendCommand', () => {
  let command: BestFriendCommand;
  let apiClient: { getMyBestFriends: Mock; getDuoChemistry: Mock };

  beforeEach(() => {
    apiClient = {
      getMyBestFriends: vi.fn().mockResolvedValue(bestFriendResponse()),
      getDuoChemistry: vi.fn().mockResolvedValue(duoResponse()),
    };

    const i18n = new BotI18nService();
    i18n.onModuleInit();
    command = new BestFriendCommand(
      apiClient as unknown as BotApiClientService,
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as unknown as BotApiClientService),
    );
  });

  // ─── 무옵션 경로 — 회귀 가드(F-COPRESENCE-014 완전 불변) ─────────────────────

  it('무옵션이면 deferReply()를 인자 없이 호출하고(공개 응답) getMyBestFriends만 호출하며 getDuoChemistry는 호출하지 않는다', async () => {
    const interaction = makeInteraction();

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(apiClient.getMyBestFriends).toHaveBeenCalledTimes(1);
    expect(apiClient.getDuoChemistry).not.toHaveBeenCalled();
  });

  // ─── 상대 = 타인 ─────────────────────────────────────────────────────────────

  it('상대가 타인이면 deferReply({ephemeral:true}) 후 getDuoChemistry를 호출하고 공개 버튼을 포함해 응답한다', async () => {
    const interaction = makeInteraction({ options: makeOptions(makePeerUser('peer-1'), {}) });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(apiClient.getDuoChemistry).toHaveBeenCalledTimes(1);
    expect(apiClient.getMyBestFriends).not.toHaveBeenCalled();

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      content: string;
      components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
    };
    const buttons = call.components[0].components.map((b) => b.toJSON());
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toMatchObject({ custom_id: 'friend:duo:publish:peer-1' });
  });

  it('공개 경고 문구("공개하면 상대방을 포함한 채널 전원에게 보입니다")를 응답 content에 포함한다(D-3 이행)', async () => {
    const interaction = makeInteraction({ options: makeOptions(makePeerUser('peer-1'), {}) });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: '공개하면 상대방을 포함한 채널 전원에게 보입니다.' }),
    );
  });

  // ─── 상대 = 본인 (D-6) ───────────────────────────────────────────────────────

  it('상대가 본인이면 개인 카드 경로로 폴백한다(공개 defer, D-6) — 듀오 카드/버튼 미생성', async () => {
    const interaction = makeInteraction({ options: makeOptions(makePeerUser(USER_ID), {}) });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(interaction.deferReply).toHaveBeenCalledWith();
    expect(apiClient.getMyBestFriends).toHaveBeenCalledTimes(1);
    expect(apiClient.getDuoChemistry).not.toHaveBeenCalled();
  });

  // ─── 상대 = 봇 (EC-CP-46) ────────────────────────────────────────────────────

  it('상대가 봇이면 ephemeral 안내만 하고 어떤 API도 호출하지 않는다(EC-CP-46)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makePeerUser('bot-1', { bot: true }), {}),
    });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '봇과의 케미는 집계되지 않아요.',
      ephemeral: true,
    });
    expect(apiClient.getMyBestFriends).not.toHaveBeenCalled();
    expect(apiClient.getDuoChemistry).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  // ─── 상대 = 비멤버 (EC-CP-48) ────────────────────────────────────────────────

  it('상대가 서버 비멤버(getMember 없음)이면 ephemeral 안내만 하고 어떤 API도 호출하지 않는다(EC-CP-48)', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makePeerUser('peer-1'), null),
    });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '상대가 이 서버의 멤버가 아니에요.',
      ephemeral: true,
    });
    expect(apiClient.getMyBestFriends).not.toHaveBeenCalled();
    expect(apiClient.getDuoChemistry).not.toHaveBeenCalled();
  });

  // ─── 길드 밖(DM) ─────────────────────────────────────────────────────────────

  it('길드 밖(DM)이면 errors.guildOnly 안내 후 어떤 API도 호출하지 않는다', async () => {
    const interaction = makeInteraction({ guildId: null });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '서버에서만 사용 가능한 명령어입니다.',
      ephemeral: true,
    });
    expect(apiClient.getMyBestFriends).not.toHaveBeenCalled();
    expect(apiClient.getDuoChemistry).not.toHaveBeenCalled();
  });

  // ─── API ok:false — 듀오 경로는 버튼 없이 에러 문구만(Q4 확정) ────────────────

  it('듀오 경로에서 API가 ok:false를 반환하면 에러 문구만 표시하고 버튼/파일은 포함하지 않는다', async () => {
    const interaction = makeInteraction({ options: makeOptions(makePeerUser('peer-1'), {}) });
    apiClient.getDuoChemistry.mockResolvedValue(duoResponse({ ok: false, data: null }));

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '듀오 케미 카드 조회 중 오류가 발생했습니다.',
    });
  });

  it('무옵션 경로의 API ok:false 동작은 기존과 동일하게 링크 버튼을 유지한다(회귀 없음)', async () => {
    const interaction = makeInteraction();
    apiClient.getMyBestFriends.mockResolvedValue(bestFriendResponse({ ok: false, data: null }));

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      content: string;
      components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
    };
    expect(call.content).toBe('베스트 프렌드 조회 중 오류가 발생했습니다.');
    expect(call.components[0].components).toHaveLength(1); // 대시보드 링크 버튼 유지
  });

  it('무옵션 경로의 API ok:true·data:null(!result.data) 동작도 링크 버튼을 유지한다(회귀 없음)', async () => {
    const interaction = makeInteraction();
    apiClient.getMyBestFriends.mockResolvedValue(bestFriendResponse({ data: null }));

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      content: string;
      components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
    };
    expect(call.content).toBe(
      '최근 90일간 함께한 친구 기록이 없어요. 음성방에 들어가 친구를 만들어보세요!',
    );
    expect(call.components[0].components).toHaveLength(1); // 대시보드 링크 버튼 유지
  });

  it('무옵션 경로 렌더 성공 시에도 파일과 함께 링크 버튼을 포함해 응답한다(회귀 없음)', async () => {
    const interaction = makeInteraction();

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      files: unknown[];
      components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
    };
    expect(call.files).toHaveLength(1);
    expect(call.components[0].components).toHaveLength(1); // 대시보드 링크 버튼 유지
  });

  // ─── C2 결함 수정 — catch(예외) 경로에서도 링크 버튼을 유지한다 ─────────────────

  it('API 호출이 reject되면(예외) catch 경로에서도 에러 문구와 함께 링크 버튼을 포함해 응답한다(C2 회귀 가드)', async () => {
    const interaction = makeInteraction();
    apiClient.getMyBestFriends.mockRejectedValue(new Error('network fail'));

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      content: string;
      components: Array<{ components: Array<{ toJSON: () => Record<string, unknown> }> }>;
    };
    expect(call.content).toBe('베스트 프렌드 조회 중 오류가 발생했습니다.');
    expect(call.components).toHaveLength(1);
    expect(call.components[0].components).toHaveLength(1); // catch 경로에서도 링크 버튼 유지(C2)
  });

  it('buildLinkButtonRow가 예외를 던지면 컴포넌트를 빈 배열로 폴백하고 핸들러가 정상 종료된다(방어 코드)', async () => {
    const interaction = makeInteraction();
    const buildSpy = vi
      .spyOn(
        BestFriendCommand.prototype as unknown as Record<string, (...args: unknown[]) => unknown>,
        'buildLinkButtonRow',
      )
      .mockImplementation(() => {
        throw new Error('build failed');
      });

    await expect(
      command.onBestFriend(interaction, new BestFriendCommandDto()),
    ).resolves.toBeUndefined();

    const call = (interaction.editReply as Mock).mock.calls[0][0] as {
      files: unknown[];
      components: unknown[];
    };
    expect(call.files).toHaveLength(1);
    expect(call.components).toEqual([]); // buildLinkButtonRow 실패 시 버튼 없이 폴백

    buildSpy.mockRestore();
  });

  it('buildLinkButtonRow가 예외를 던지고 API도 reject되면(이중 실패) catch 경로에서도 컴포넌트가 빈 배열로 폴백하고 핸들러가 정상 종료된다', async () => {
    const interaction = makeInteraction();
    apiClient.getMyBestFriends.mockRejectedValue(new Error('network fail'));
    const buildSpy = vi
      .spyOn(
        BestFriendCommand.prototype as unknown as Record<string, (...args: unknown[]) => unknown>,
        'buildLinkButtonRow',
      )
      .mockImplementation(() => {
        throw new Error('build failed');
      });

    await expect(
      command.onBestFriend(interaction, new BestFriendCommandDto()),
    ).resolves.toBeUndefined();

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '베스트 프렌드 조회 중 오류가 발생했습니다.',
      components: [],
    });

    buildSpy.mockRestore();
  });

  // ─── §2-F 불변식 — userId는 항상 interaction.user.id(P0 회귀 가드) ──────────

  it('§2-F 불변식: 상대 지정 경로에서도 getDuoChemistry에 넘어가는 userId는 항상 interaction.user.id다(peer.id로 대체되지 않는다)', async () => {
    const interaction = makeInteraction({ options: makeOptions(makePeerUser('peer-1'), {}) });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(apiClient.getDuoChemistry).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, peerId: 'peer-1' }),
    );
  });

  it('§2-F 불변식: 무옵션 경로에서도 getMyBestFriends에 넘어가는 userId는 interaction.user.id다', async () => {
    const interaction = makeInteraction();

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(apiClient.getMyBestFriends).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  // ─── PR#416 리뷰 결함3 — peer 이름은 전역 displayName이 아닌 길드 닉네임 ──────

  it('peer의 GuildMember 닉네임이 있으면 전역 displayName 대신 길드 닉네임을 peerDisplayName으로 전달한다', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makePeerUser('peer-1'), { displayName: '길드닉네임' }),
    });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(apiClient.getDuoChemistry).toHaveBeenCalledWith(
      expect.objectContaining({ peerDisplayName: '길드닉네임' }),
    );
  });

  it('peer의 GuildMember에 displayName이 없으면(엣지) peerUser.displayName으로 폴백한다', async () => {
    const interaction = makeInteraction({
      options: makeOptions(makePeerUser('peer-1'), {}),
    });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(apiClient.getDuoChemistry).toHaveBeenCalledWith(
      expect.objectContaining({ peerDisplayName: 'peer-peer-1' }),
    );
  });

  it('§2-F 불변식: 본인 폴백 경로에서도 getMyBestFriends의 userId는 interaction.user.id다', async () => {
    const interaction = makeInteraction({ options: makeOptions(makePeerUser(USER_ID), {}) });

    await command.onBestFriend(interaction, new BestFriendCommandDto());

    expect(apiClient.getMyBestFriends).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID }),
    );
  });
});
