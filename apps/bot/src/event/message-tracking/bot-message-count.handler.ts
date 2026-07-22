import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import type { Message } from 'discord.js';

/** 재시도 지연(ms) — 스티키 핸들러(BotStickyMessageHandler) 패턴과 동일 */
const RETRY_DELAY_MS = 1000;

/**
 * 독립 메시지 카운트 이벤트 핸들러 (F-MSG-001).
 * 스티키 메시지 핸들러(BotStickyMessageHandler)와 완전히 분리된 별도 @On('messageCreate')
 * 핸들러다 — 스티키 핸들러는 등록된(enabled) 채널만 처리하므로 여기에 카운트 로직을 얹으면
 * 미등록 채널의 메시지가 전수 누락된다 (PRD §5 ⚠️).
 *
 * message.content는 어떤 형태로도 조회·전송하지 않는다 — 메타데이터(길드/채널/유저 식별자)만
 * API로 전달한다 (PRD §2 프라이버시 원칙).
 */
@Injectable()
export class BotMessageCountHandler {
  private readonly logger = new Logger(BotMessageCountHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('messageCreate')
  async handleMessageCreate(message: Message): Promise<void> {
    const guildId = message.guildId;
    if (!guildId) return; // DM 등 길드 밖 메시지 드롭

    // 필터링 (F-MSG-002): 봇 / 시스템 메시지 / 웹훅 발신 메시지는 카운트하지 않는다
    if (message.author.bot) return;
    if (message.system) return;
    if (message.webhookId) return;

    const channel = message.channel;
    const payload = {
      guildId,
      channelId: message.channelId, // 스레드는 스레드 자체 ID (부모와 별도 집계, F-MSG-002)
      channelName: 'name' in channel ? (channel.name ?? '') : '',
      isThread: channel.isThread(),
      userId: message.author.id,
      userName: message.author.username,
    };

    try {
      await this.apiClient.sendMessageCounted(payload);
    } catch {
      // 1회 재시도 (1초 후, 스티키 핸들러 패턴과 동일)
      setTimeout(() => {
        this.apiClient.sendMessageCounted(payload).catch((retryErr: unknown) => {
          this.logger.error(
            `[BOT] messageCounted forwarding failed after retry: guild=${guildId} channel=${message.channelId}`,
            retryErr instanceof Error ? retryErr.stack : retryErr,
          );
        });
      }, RETRY_DELAY_MS);
    }
  }
}
