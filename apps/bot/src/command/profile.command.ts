import { Command } from '@discord-nestjs/core';
import { Injectable } from '@nestjs/common';

import { MeCommand } from './me.command';

/**
 * `/profile`(ko `/프로필`) — `/me`(`/미`)의 별칭 커맨드(F-VOICE-123, 마스터 플랜 §2.3
 * 2026-09-04 개정 6항 "카드 하나, 이름 여럿").
 *
 * `@Command` 메타데이터는 클래스 **프로토타입**에 저장되고(`Reflect.defineMetadata`),
 * discord-nestjs 의 커맨드 탐색은 프로토타입 체인을 그대로 타므로, 재선언 없이
 * `class ProfileCommand extends MeCommand {}` 만 두면 `MeCommand.prototype` 의
 * `name:'me'` 를 그대로 상속해 별칭이 등록되지 않거나 `/me` 와 충돌한다. 아래
 * `@Command` 재선언이 필수다(plan docs/plans/me-card-alias.md §2 결론 A/B).
 *
 * 🔒 이 클래스 본문에 constructor 를 절대 선언하지 말 것 — 선언하면 TS 가 이 클래스
 * 자체의 `design:paramtypes` 를 emit 해 부모(`MeCommand`)의 DI 의존 3개
 * (`BotApiClientService` / `BotI18nService` / `LocaleResolverService`)가 전부
 * `undefined` 로 깨진다(plan §2 결론 C, T4 회귀 가드).
 */
@Command({
  name: 'profile',
  nameLocalizations: { ko: '프로필' },
  description: 'View your profile and voice activity',
  descriptionLocalizations: { ko: '내 프로필과 음성 활동을 확인합니다' },
})
@Injectable()
export class ProfileCommand extends MeCommand {}
