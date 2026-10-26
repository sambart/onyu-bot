/**
 * 슬래시 커맨드 현지화 회귀 가드 (i18n-pt-br-bot 계획 Q2, 2026-10-23).
 *
 * 정책(F-GENERAL-007 요구 5): 커맨드·옵션·choice **이름**은 `pt-BR` 로 현지화하지 않는다
 * (기본 en 이름 유지 — 기계 번역 라벨 노출 금지). **설명**만 `pt-BR` 을 가진다.
 *
 * 메타데이터는 `me.dto.spec.ts` 와 같이 라이브러리가 public export 하는 `ReflectMetadataProvider`
 * 로 읽는다. 옵션은 DTO 클래스의 프로퍼티 단위로 정의돼 있어 (DTO, 프로퍼티) 목록을 명시한다 —
 * 새 옵션이 추가되면 아래 목록에 넣어야 가드가 적용된다.
 */
import 'reflect-metadata';

import { ReflectMetadataProvider } from '@discord-nestjs/core';
import type { Type } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AdminAssistCommand } from './admin-assist/admin-assist.command';
import { AdminAssistCommandDto } from './admin-assist/admin-assist.dto';
import { BestFriendCommand } from './friend/best-friend.command';
import { BestFriendCommandDto } from './friend/best-friend.dto';
import { HelpCommand } from './help.command';
import { LeaderboardCommand } from './level/leaderboard.command';
import { LeaderboardCommandDto } from './level/leaderboard.dto';
import { RankCommand } from './level/rank.command';
import { RankCommandDto } from './level/rank.dto';
import { MeCommand } from './me.command';
import { MeCommandDto } from './me.dto';
import { ProfileCommand } from './profile.command';
import { StickyMessageDeleteCommand } from './sticky-message/sticky-message-delete.command';
import { StickyMessageDeleteDto } from './sticky-message/sticky-message-delete.dto';
import { StickyMessageListCommand } from './sticky-message/sticky-message-list.command';
import { StickyMessageRegisterCommand } from './sticky-message/sticky-message-register.command';
import { VersionCommand } from './version.command';

const PT_BR = 'pt-BR';
const MIN_DESCRIPTION_LENGTH = 1;
const MAX_DESCRIPTION_LENGTH = 100;

interface Localizable {
  name?: string;
  description?: string;
  nameLocalizations?: Record<string, string>;
  descriptionLocalizations?: Record<string, string>;
}

interface ChoiceEntry {
  nameLocalizations?: Record<string, string>;
}

const metadataProvider = new ReflectMetadataProvider();

const COMMANDS: Type[] = [
  VersionCommand,
  HelpCommand,
  StickyMessageRegisterCommand,
  StickyMessageDeleteCommand,
  StickyMessageListCommand,
  MeCommand,
  ProfileCommand,
  BestFriendCommand,
  RankCommand,
  LeaderboardCommand,
  AdminAssistCommand,
];

const OPTIONS: Array<{ dto: Type; property: string }> = [
  { dto: StickyMessageDeleteDto, property: 'channel' },
  { dto: MeCommandDto, property: 'view' },
  { dto: BestFriendCommandDto, property: 'peer' },
  { dto: LeaderboardCommandDto, property: 'page' },
  { dto: RankCommandDto, property: 'user' },
  { dto: AdminAssistCommandDto, property: 'query' },
];

const OPTIONS_WITH_CHOICES: Array<{ dto: Type; property: string }> = [
  { dto: MeCommandDto, property: 'view' },
];

function readCommand(command: Type): Localizable {
  return metadataProvider.getCommandDecoratorMetadata(command.prototype) as Localizable;
}

function readOption(dto: Type, property: string): Localizable {
  return metadataProvider.getParamDecoratorMetadata(dto, property) as Localizable;
}

function expectNoPtBrName(meta: Localizable): void {
  expect(meta.nameLocalizations?.[PT_BR]).toBeUndefined();
}

function expectPtBrDescription(meta: Localizable): void {
  const text = meta.descriptionLocalizations?.[PT_BR];

  expect(text).toBeDefined();
  expect(text?.length).toBeGreaterThanOrEqual(MIN_DESCRIPTION_LENGTH);
  expect(text?.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
}

describe('슬래시 커맨드 현지화 — 이름은 pt-BR 미현지화, 설명만 pt-BR (Q2)', () => {
  describe.each(COMMANDS.map((command) => [command.name, command] as const))(
    '커맨드 %s',
    (_name, command) => {
      it(`nameLocalizations 에 ${PT_BR} 이 없다`, () => {
        expectNoPtBrName(readCommand(command));
      });

      it(`descriptionLocalizations 에 ${PT_BR} 이 있고 1~100자다`, () => {
        expectPtBrDescription(readCommand(command));
      });
    },
  );

  describe.each(
    OPTIONS.map((option) => [`${option.dto.name}.${option.property}`, option] as const),
  )('옵션 %s', (_name, option) => {
    it(`nameLocalizations 에 ${PT_BR} 이 없다`, () => {
      expectNoPtBrName(readOption(option.dto, option.property));
    });

    it(`descriptionLocalizations 에 ${PT_BR} 이 있고 1~100자다`, () => {
      expectPtBrDescription(readOption(option.dto, option.property));
    });
  });

  describe.each(
    OPTIONS_WITH_CHOICES.map(
      (option) => [`${option.dto.name}.${option.property}`, option] as const,
    ),
  )('choice %s', (_name, option) => {
    it(`모든 choice 의 nameLocalizations 에 ${PT_BR} 이 없다`, () => {
      const choices = metadataProvider.getChoiceDecoratorMetadata(
        option.dto,
        option.property,
      ) as Record<string, ChoiceEntry>;

      expect(Object.keys(choices).length).toBeGreaterThan(0);
      for (const choice of Object.values(choices)) {
        expect(choice.nameLocalizations?.[PT_BR]).toBeUndefined();
      }
    });
  });

  it('검증 대상 커맨드가 등록 커맨드 11종, 옵션이 6곳이다 (신규 추가 시 목록 갱신 강제)', () => {
    expect(COMMANDS).toHaveLength(11);
    expect(OPTIONS).toHaveLength(6);
  });
});
