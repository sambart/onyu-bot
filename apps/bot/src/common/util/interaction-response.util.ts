import type { Logger } from '@nestjs/common';

/** 오류 안내 전송에 필요한 최소 인터랙션 표면 — 테스트에서 전체 discord.js 객체를 목킹하지 않도록 좁혔다 */
export interface RespondableInteraction {
  deferred: boolean;
  replied: boolean;
  reply(options: { content: string; ephemeral: true }): Promise<unknown>;
  editReply(options: { content: string }): Promise<unknown>;
}

/**
 * 핸들러 catch 블록용 오류 안내 전송.
 * 첫 응답(reply/deferReply)을 try 안으로 편입하면 catch 시점에 "아직 아무 응답도 못 한" 상태가 생기므로,
 * 응답 상태에 따라 reply(ephemeral) / editReply 를 고른다. 안내 전송 자체가 실패해도(만료된
 * 인터랙션 등) 던지지 않고 로그만 남겨 핸들러가 unhandled rejection 으로 터지지 않게 한다.
 *
 * @param interaction 응답 가능한 인터랙션
 * @param content 사용자에게 보일 고정 i18n 문구(내부 error.message 를 넣지 말 것)
 * @param logger 호출 측 로거
 */
export async function respondWithErrorNotice(
  interaction: RespondableInteraction,
  content: string,
  logger: Logger,
): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch (error) {
    logger.warn(
      `오류 안내 응답 전송 실패: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
