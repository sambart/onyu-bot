import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotCommonModule } from '../common/bot-common.module';
import { BotAutoChannelInteractionHandler } from './auto-channel/bot-auto-channel-interaction.handler';
import { BotChannelStateHandler } from './channel/bot-channel-state.handler';
import { BotDuoChemistryInteractionHandler } from './friend/bot-duo-chemistry-interaction.handler';
import { BotGuildCreateHandler } from './guild-member/bot-guild-create.handler';
import { BotGuildMemberSyncHandler } from './guild-member/bot-guild-member-sync.handler';
import { BotMemberRemoveHandler } from './guild-member/bot-member-remove.handler';
import { BotMemberUpdateHandler } from './guild-member/bot-member-update.handler';
import { BotUserUpdateHandler } from './guild-member/bot-user-update.handler';
import { BotGuildRoleCreateHandler } from './guild-role/bot-guild-role-create.handler';
import { BotGuildRoleEventHandler } from './guild-role/bot-guild-role-event.handler';
import { BotGuildRoleReconcileScheduler } from './guild-role/bot-guild-role-reconcile.scheduler';
import { BotGuildRoleSyncHandler } from './guild-role/bot-guild-role-sync.handler';
import { BotLevelInteractionHandler } from './level/bot-level-interaction.handler';
import { BotMeInteractionHandler } from './me/bot-me-interaction.handler';
import { BotMessageCountHandler } from './message-tracking/bot-message-count.handler';
import { BotNewbieInteractionHandler } from './newbie/bot-newbie-interaction.handler';
import { BotNewbieMemberAddHandler } from './newbie/bot-newbie-member-add.handler';
import { BotRolePanelInteractionHandler } from './role-panel/bot-role-panel-interaction.handler';
import { RolePanelInteractionService } from './role-panel/bot-role-panel-interaction.service';
import { BotStatusPrefixInteractionHandler } from './status-prefix/bot-status-prefix-interaction.handler';
import { BotStickyMessageHandler } from './sticky-message/bot-sticky-message.handler';
import { BotCommandUsageHandler } from './usage-analytics/bot-command-usage.handler';
import { BotGuildLifecycleHandler } from './usage-analytics/bot-guild-lifecycle.handler';
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
    BotGuildLifecycleHandler,
    // Guild Role
    BotGuildRoleSyncHandler,
    BotGuildRoleCreateHandler,
    BotGuildRoleEventHandler,
    BotGuildRoleReconcileScheduler,
    // Role Panel
    BotRolePanelInteractionHandler,
    RolePanelInteractionService,
    // Me (F-VOICE-064/065)
    BotMeInteractionHandler,
    // Friend — 듀오 케미 카드 [🔗 채널에 공개하기] 버튼(F-COPRESENCE-029)
    BotDuoChemistryInteractionHandler,
    // Level — /랭킹 [이전]/[다음] 페이지 버튼(F-LVL-26, U9 S7)
    BotLevelInteractionHandler,
  ],
})
export class BotEventModule {}
