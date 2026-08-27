/**
 * BotDuoChemistryInteractionHandler 단위 테스트 — [🔗 채널에 공개하기] 버튼
 * interactionCreate 이벤트 처리를 검증한다(F-COPRESENCE-029, D-3, edge-cases §11.2
 * EC-CP-49 + 인접 방어).
 *
 * PR#416 리뷰 결함1+2 수정 반영 — 이 핸들러는 더 이상 API(`getDuoChemistry`)를 호출하지
 * 않는다. 원본 ephemeral 메시지에 이미 첨부된 카드 PNG의 CDN URL(`interaction.message
 * .attachments`)을 재사용해 채널에 공개 게시한다. 진입 즉시 `deferUpdate()`로 ACK한 뒤
 * `editReply()`로 원본 버튼을 제거하고 `followUp()`으로 채널에 게시한다.
 */
import type { ButtonInteraction, Interaction } from 'discord.js';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { LocaleResolverService } from '../../common/application/locale-resolver.service';
import { BotDuoChemistryInteractionHandler } from './bot-duo-chemistry-interaction.handler';

const GUILD_ID = 'guild-1';
const USER_ID = 'user-1';
const CUSTOM_ID_PREFIX = 'friend:duo:publish:';
const PEER_ID = 'peer-1';
const ATTACHMENT_URL = 'https://cdn.discordapp.com/attachments/1/2/duo-chemistry.png';

const PUBLISH_FAILED_KO = '채널에 공개하지 못했어요. 잠시 후 다시 시도해주세요.';

function makeAttachmentCollection(url: string | undefined): {
  first: () => { url: string } | undefined;
} {
  return { first: () => (url === undefined ? undefined : { url }) };
}

function makeButtonInteraction(overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    isButton: () => true,
    customId: `${CUSTOM_ID_PREFIX}${PEER_ID}`,
    user: { id: USER_ID, displayName: 'Alice', displayAvatarURL: () => 'https://cdn/avatar.png' },
    guildId: GUILD_ID,
    locale: 'ko',
    message: { attachments: makeAttachmentCollection(ATTACHMENT_URL) },
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    isRepliable: () => true,
    replied: false,
    deferred: false,
    ...overrides,
  } as unknown as ButtonInteraction;
}

describe('BotDuoChemistryInteractionHandler', () => {
  let handler: BotDuoChemistryInteractionHandler;

  beforeEach(() => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    handler = new BotDuoChemistryInteractionHandler(
      i18n,
      new LocaleResolverService({
        getUserLocale: vi.fn().mockResolvedValue({ locale: null }),
      } as never),
    );
  });

  // ─── 공통 필터링 ─────────────────────────────────────────────────────────────

  describe('공통 필터링', () => {
    it('버튼이 아닌 인터랙션은 무시한다(isButton()=false)', async () => {
      const interaction = { isButton: () => false } as unknown as Interaction;

      await handler.handle(interaction);
    });

    it('customId 접두어(friend:duo:publish:)가 아니면 무시한다(다른 핸들러의 버튼을 가로채지 않는다)', async () => {
      const interaction = makeButtonInteraction({ customId: 'me:activity_detail' });

      await handler.handle(interaction);

      expect(interaction.deferUpdate).not.toHaveBeenCalled();
    });

    it('DM(guildId 없음)이면 무시하고 채널 공개 게시를 시도하지 않는다', async () => {
      const interaction = makeButtonInteraction({ guildId: null });

      await handler.handle(interaction);

      expect(interaction.deferUpdate).not.toHaveBeenCalled();
    });
  });

  // ─── 정상 공개 게시(Q3 확정 흐름) ────────────────────────────────────────────

  describe('정상 공개 게시', () => {
    it('진입 즉시 deferUpdate()로 ACK한다(3초 창 확보, PR#416 리뷰 결함1+2)', async () => {
      const interaction = makeButtonInteraction();

      await handler.handle(interaction);

      expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    });

    it('원본 첨부 URL을 재사용해 새 AttachmentBuilder로 채널에 게시한다(API 재호출 없음)', async () => {
      const interaction = makeButtonInteraction();

      await handler.handle(interaction);

      expect(interaction.followUp).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: false, files: expect.any(Array) }),
      );
    });

    it('원본 ephemeral 메시지의 버튼을 먼저 제거한 뒤(editReply) 채널에 공개 게시한다(followUp, 중복 게시 방지)', async () => {
      const interaction = makeButtonInteraction();

      await handler.handle(interaction);

      expect(interaction.editReply).toHaveBeenCalledWith({ components: [] });
      expect(interaction.followUp).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: false, files: expect.any(Array) }),
      );
      const deferOrder = (interaction.deferUpdate as Mock).mock.invocationCallOrder[0];
      const editReplyOrder = (interaction.editReply as Mock).mock.invocationCallOrder[0];
      const followUpOrder = (interaction.followUp as Mock).mock.invocationCallOrder[0];
      expect(deferOrder).toBeLessThan(editReplyOrder);
      expect(editReplyOrder).toBeLessThan(followUpOrder);
    });
  });

  // ─── 원본 첨부 소실(엣지) ────────────────────────────────────────────────────

  it('원본 메시지에 첨부가 없으면(엣지) ephemeral 안내만 하고 editReply/공개 게시를 시도하지 않는다', async () => {
    const interaction = makeButtonInteraction({
      message: { attachments: makeAttachmentCollection(undefined) },
    });

    await handler.handle(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: PUBLISH_FAILED_KO,
      ephemeral: true,
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  // ─── 채널 전송 권한 없음(공개 게시 자체 실패) ──────────────────────────────────

  it('채널 공개 게시(followUp)가 실패하면(권한 없음 등) 예외를 던지지 않고 ephemeral로 사유를 안내한다', async () => {
    const followUp = vi
      .fn()
      .mockRejectedValueOnce(new Error('Missing Permissions'))
      .mockResolvedValueOnce(undefined);
    const interaction = makeButtonInteraction({ followUp });

    await expect(handler.handle(interaction)).resolves.toBeUndefined();

    expect(interaction.editReply).toHaveBeenCalledWith({ components: [] });
    expect(followUp).toHaveBeenCalledTimes(2);
    expect(followUp).toHaveBeenNthCalledWith(2, { content: PUBLISH_FAILED_KO, ephemeral: true });
  });

  // ─── EC-CP-49: 만료된 상호작용(15분 초과)·봇 재시작 후 클릭 ──────────────────

  it('EC-CP-49: deferUpdate() 자체가 실패해도(Unknown interaction) 예외를 전파하지 않는다(500 금지)', async () => {
    const interaction = makeButtonInteraction({
      deferUpdate: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
      isRepliable: () => false,
    });

    await expect(handler.handle(interaction)).resolves.toBeUndefined();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('EC-CP-49: deferUpdate() 실패 후에도 재응답 가능한 드문 경우(isRepliable=true)엔 ephemeral 안내를 시도한다', async () => {
    const interaction = makeButtonInteraction({
      deferUpdate: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
      isRepliable: () => true,
      replied: false,
      deferred: false,
    });

    await handler.handle(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({ content: PUBLISH_FAILED_KO, ephemeral: true });
  });

  it('EC-CP-49 인접 방어: 이미 응답(replied)된 인터랙션이면 reply() 대신 followUp()으로 안내한다', async () => {
    const interaction = makeButtonInteraction({
      deferUpdate: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
      isRepliable: () => true,
      replied: true,
    });

    await expect(handler.handle(interaction)).resolves.toBeUndefined();
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: PUBLISH_FAILED_KO,
      ephemeral: true,
    });
  });

  it('deferUpdate() 성공 후 후속 처리(editReply)가 실패하면 reply() 대신 followUp()으로 안내한다(이미 ACK됨)', async () => {
    const interaction = makeButtonInteraction({
      editReply: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
      deferred: true,
    });

    await expect(handler.handle(interaction)).resolves.toBeUndefined();

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: PUBLISH_FAILED_KO,
      ephemeral: true,
    });
  });
});
