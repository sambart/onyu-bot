import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { GatewayLifecycleListener } from './gateway-lifecycle.listener';
import { InteractionDiagnosticsListener } from './interaction-diagnostics.listener';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [InteractionDiagnosticsListener, GatewayLifecycleListener],
})
export class InteractionDiagnosticsModule {}
