import { Param, ParamType } from '@discord-nestjs/core';

/**
 * `/친한친구` 선택 옵션 `상대`(`peer`, F-COPRESENCE-029) — 코드베이스 최초의 `ParamType.USER` 사용.
 *
 * 실측 완료(계획 §8-Q1): `@discord-nestjs/common`의 `SlashCommandPipe`는
 * `interaction.options.get(name).value`만 DTO에 담는다 — USER 타입 옵션의 `.value`는
 * discord.js에서 snowflake `string`이다(`User` 객체가 아니다). 표시명·아바타 등 `User` 객체가
 * 필요하면 핸들러에서 `interaction.options.getUser('peer')`(추가 API 호출 없음)로 얻는다.
 */
export class BestFriendCommandDto {
  @Param({
    name: 'peer',
    nameLocalizations: { ko: '상대' },
    description: 'Check your duo chemistry with this user',
    descriptionLocalizations: { ko: '이 사용자와의 케미를 확인합니다' },
    required: false,
    type: ParamType.USER,
  })
  peer?: string;
}
