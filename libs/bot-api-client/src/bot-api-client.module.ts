import { HttpModule } from '@nestjs/axios';
import { DynamicModule, Module } from '@nestjs/common';

import { BotApiClientService } from './bot-api-client.service';

export interface BotApiClientModuleOptions {
  baseUrl: string;
  apiKey: string;
}

@Module({})
export class BotApiClientModule {
  static forRoot(options: BotApiClientModuleOptions): DynamicModule {
    return {
      module: BotApiClientModule,
      imports: [
        HttpModule.register({
          baseURL: options.baseUrl,
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
          },
          timeout: 10_000,
        }),
      ],
      providers: [BotApiClientService],
      exports: [BotApiClientService],
      global: true,
    };
  }
}
