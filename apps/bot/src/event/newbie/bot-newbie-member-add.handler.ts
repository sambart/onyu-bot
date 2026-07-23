import { InjectDiscordClient, On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService, type NewbieConfigDto } from '@onyu/bot-api-client';
import { Client, EmbedBuilder, type GuildMember } from 'discord.js';

/**
 * Discord guildMemberAdd 이벤트를 수신하여 신입 온보딩을 처리한다.
 * - 환영인사: Bot에서 직접 Discord 메시지 전송 (GuildMember 필요)
 * - 미션 생성: API에 위임
 * - 역할 부여: Bot에서 직접 Discord API 호출 후 API에 통보
 */
@Injectable()
export class BotNewbieMemberAddHandler {
  private readonly logger = new Logger(BotNewbieMemberAddHandler.name);

  constructor(
    private readonly apiClient: BotApiClientService,
    @InjectDiscordClient() private readonly discord: Client,
  ) {}

  @On('guildMemberAdd')
  async handleGuildMemberAdd(member: GuildMember): Promise<void> {
    const guildId = member.guild.id;

    // guild-member upsert (newbie 설정과 무관하게 항상 실행)
    try {
      await this.apiClient.upsertGuildMember({
        guildId,
        userId: member.id,
        displayName: member.displayName,
        username: member.user.username,
        nick: member.nickname,
        avatarUrl: member.displayAvatarURL({ size: 128 }),
        isBot: member.user.bot,
        joinedAt: member.joinedAt?.toISOString() ?? null,
      });
    } catch (err) {
      this.logger.error(
        `[BOT] guild-member upsert failed: guild=${guildId} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
    }

    // 1. API에서 설정 조회 (getNewbieConfig는 내부에서 실패를 흡수하고 null을 반환한다)
    const config: NewbieConfigDto | null = await this.apiClient.getNewbieConfig(guildId);
    if (!config) return;

    // 2. 환영인사 (Bot에서 직접 Discord 메시지 전송) — 자체 try/catch 보유
    if (config.welcomeEnabled && config.welcomeChannelId) {
      await this.sendWelcomeMessage(member, config);
    }

    // P2: 3(미션 생성)과 4(역할 부여)를 개별 try/catch로 격리한다.
    // API가 실패를 rethrow(HTTP 500)하게 되었으므로, 하나의 try/catch로 묶으면
    // 미션 생성 실패가 역할 부여(step 4)까지 막는 회귀가 발생한다.

    // 3. 미션 생성 (API 호출)
    if (config.missionEnabled) {
      try {
        await this.apiClient.sendMemberJoin({
          guildId,
          memberId: member.id,
          displayName: member.displayName,
        });
      } catch (err) {
        this.logger.error(
          `[BOT] sendMemberJoin failed: guild=${guildId} member=${member.id}`,
          err instanceof Error ? err.stack : err,
        );
      }
    }

    // 4. 역할 부여 (Bot에서 직접 Discord API 호출) — 자체 try/catch 보유
    if (config.roleEnabled && config.newbieRoleId) {
      await this.assignRole(member, config.newbieRoleId, guildId);
    }
  }

  private async sendWelcomeMessage(member: GuildMember, config: NewbieConfigDto): Promise<void> {
    if (!config.welcomeChannelId) return;
    try {
      const channel = await this.discord.channels.fetch(config.welcomeChannelId).catch(() => null);
      if (!channel?.isTextBased()) return;

      const vars: Record<string, string> = {
        username: member.displayName,
        mention: `<@${member.id}>`,
        memberCount: String(member.guild.memberCount),
        serverName: member.guild.name,
      };

      const embed = new EmbedBuilder();

      if (config.welcomeEmbedTitle) {
        embed.setTitle(this.applyTemplate(config.welcomeEmbedTitle, vars));
      }
      if (config.welcomeEmbedDescription) {
        embed.setDescription(this.applyTemplate(config.welcomeEmbedDescription, vars));
      }
      if (config.welcomeEmbedColor) {
        embed.setColor(config.welcomeEmbedColor as `#${string}`);
      }
      if (config.welcomeEmbedThumbnailUrl) {
        embed.setThumbnail(config.welcomeEmbedThumbnailUrl);
      } else {
        embed.setThumbnail(member.displayAvatarURL({ size: 128 }));
      }

      const content = config.welcomeContent
        ? this.applyTemplate(config.welcomeContent, vars)
        : undefined;

      await channel.send({ content, embeds: [embed.toJSON()] });
    } catch (err) {
      this.logger.error(
        `[BOT] Welcome message failed: guild=${member.guild.id} member=${member.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  private applyTemplate(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
      template,
    );
  }

  private async assignRole(member: GuildMember, roleId: string, guildId: string): Promise<void> {
    try {
      await member.roles.add(roleId);
      this.logger.log(`[BOT] Role assigned: guild=${guildId} member=${member.id} role=${roleId}`);

      // API에 역할 부여 사실 통보 (NewbiePeriod 레코드 생성)
      await this.apiClient.notifyRoleAssigned({ guildId, memberId: member.id });
    } catch (err) {
      this.logger.error(
        `[BOT] Role assign failed: guild=${guildId} member=${member.id} role=${roleId}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
