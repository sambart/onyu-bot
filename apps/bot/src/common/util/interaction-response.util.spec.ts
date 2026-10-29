import type { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { type RespondableInteraction, respondWithErrorNotice } from './interaction-response.util';

function makeInteraction(state: { deferred: boolean; replied: boolean }) {
  return {
    ...state,
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  } satisfies RespondableInteraction;
}

const logger = { warn: vi.fn() } as unknown as Logger;

describe('respondWithErrorNotice', () => {
  it('아직 응답 전이면 ephemeral reply 로 보낸다', async () => {
    const interaction = makeInteraction({ deferred: false, replied: false });

    await respondWithErrorNotice(interaction, 'msg', logger);

    expect(interaction.reply).toHaveBeenCalledWith({ content: 'msg', ephemeral: true });
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('defer 된 상태면 editReply 로 보낸다', async () => {
    const interaction = makeInteraction({ deferred: true, replied: false });

    await respondWithErrorNotice(interaction, 'msg', logger);

    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'msg' });
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('안내 전송이 실패해도 던지지 않고 경고만 남긴다', async () => {
    const interaction = makeInteraction({ deferred: false, replied: false });
    interaction.reply.mockRejectedValue(new Error('Unknown interaction'));

    await expect(respondWithErrorNotice(interaction, 'msg', logger)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
