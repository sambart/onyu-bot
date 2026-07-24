import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotCommonModule } from '../common/bot-common.module';
import { BotAutoChannelInteractionHandler } from './auto-channel/bot-auto-channel-interaction.handler';
import { BotChannelStateHandler } from './channel/bot-channel-state.handler';
import { BotGuildCreateHandler } from './guild-member/bot-guild-create.handler';
import { BotGuildMemberSyncHandler } from './guild-member/bot-guild-member-sync.handler';
import { BotMemberRemoveHandler } from './guild-member/bot-member-remove.handler';
import { BotMemberUpdateHandler } from './guild-member/bot-member-update.handler';
import { BotUserUpdateHandler } from './guild-member/bot-user-update.handler';
import { BotMessageCountHandler } from './message-tracking/bot-message-count.handler';
import { BotNewbieInteractionHandler } from './newbie/bot-newbie-interaction.handler';
import { BotNewbieMemberAddHandler } from './newbie/bot-newbie-member-add.handler';
import { BotRolePanelInteractionHandler } from './role-panel/bot-role-panel-interaction.handler';
import { RolePanelInteractionService } from './role-panel/bot-role-panel-interaction.service';
import { BotStatusPrefixInteractionHandler } from './status-prefix/bot-status-prefix-interaction.handler';
import { BotStickyMessageHandler } from './sticky-message/bot-sticky-message.handler';
import { BotCommandUsageHandler } from './usage-analytics/bot-command-usage.handler';
import { BotVoiceStateDispatcher } from './voice/bot-voice-state.dispatcher';
import { BotVoiceSyncHandler } from './voice/bot-voice-sync.handler';

/**
 * Discord 이벤트를 수신하여 API로 전달하는 모듈.
 * API의 DiscordEventsModule을 대체한다.
 */
@Module({
  imports: [DiscordModule.forFeature(), BotCommonModule],
  providers: [
    BotVoiceStateDispatcher,
    BotVoiceSyncHandler,
    BotNewbieMemberAddHandler,
    BotNewbieInteractionHandler,
    BotStatusPrefixInteractionHandler,
    BotAutoChannelInteractionHandler,
    BotStickyMessageHandler,
    BotMessageCountHandler,
    BotChannelStateHandler,
    BotGuildMemberSyncHandler,
    BotGuildCreateHandler,
    BotMemberUpdateHandler,
    BotMemberRemoveHandler,
    BotUserUpdateHandler,
    BotCommandUsageHandler,
    // Role Panel
    BotRolePanelInteractionHandler,
    RolePanelInteractionService,
  ],
})
export class BotEventModule {}
