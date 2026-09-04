import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { BotCommonModule } from '../common/bot-common.module';
import { BestFriendCommand } from './friend/best-friend.command';
import { HelpCommand } from './help.command';
import { LeaderboardCommand } from './level/leaderboard.command';
import { RankCommand } from './level/rank.command';
import { MeCommand } from './me.command';
import { ProfileCommand } from './profile.command';
import { StickyMessageDeleteCommand } from './sticky-message/sticky-message-delete.command';
import { StickyMessageListCommand } from './sticky-message/sticky-message-list.command';
import { StickyMessageRegisterCommand } from './sticky-message/sticky-message-register.command';
import { VersionCommand } from './version.command';

/**
 * Bot 슬래시 커맨드 모듈.
 * API에서 이동된 커맨드들을 등록한다.
 */
@Module({
  imports: [DiscordModule.forFeature(), BotCommonModule],
  providers: [
    VersionCommand,
    HelpCommand,
    StickyMessageRegisterCommand,
    StickyMessageDeleteCommand,
    StickyMessageListCommand,
    // Me
    MeCommand,
    // F-VOICE-123: /profile · /프로필 (MeCommand 별칭)
    ProfileCommand,
    // Phase 5: 베스트 프렌드
    BestFriendCommand,
    // U9: /rank · /랭킹
    RankCommand,
    LeaderboardCommand,
  ],
})
export class BotCommandModule {}
