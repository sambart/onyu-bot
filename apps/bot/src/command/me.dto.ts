import { Choice, Param, ParamType } from '@discord-nestjs/core';

/** `/미 보기` 옵션 값 (F-VOICE-066) */
export enum MeViewOption {
  Level = 'level',
  Voice = 'voice',
}

export class MeCommandDto {
  // 멘트는 옵션이 아니다: 레이아웃 A 렌더 시 항상 자동 요청한다(F-VOICE-079 후속 개정, 2026-07-30).
  // 흥미용(AI 페르소나, premium-policy §6.2) 개방 시 UI 재도입 여부는 미결이다.
  @Choice({
    레벨: MeViewOption.Level,
    음성: MeViewOption.Voice,
  })
  @Param({
    name: 'view',
    nameLocalizations: { ko: '보기' },
    description: 'Card view: level (default) or the legacy voice-time card',
    descriptionLocalizations: { ko: '카드 보기: 레벨(기본) 또는 레거시 음성 시간 카드' },
    required: false,
    type: ParamType.STRING,
  })
  view?: MeViewOption;
}
