import { Choice, Param, ParamType } from '@discord-nestjs/core';

/** `/미 보기` 옵션 값 (F-VOICE-066) */
export enum MeViewOption {
  Level = 'level',
  Voice = 'voice',
  /** 연말 결산(F-RECAP, 2026-12-15~2027-01-15 노출 창) */
  Recap = 'recap',
}

export class MeCommandDto {
  // 멘트는 옵션이 아니다: 레이아웃 A 렌더 시 항상 자동 요청한다(F-VOICE-079 후속 개정, 2026-07-30).
  // 흥미용(AI 페르소나, premium-policy §6.2) 개방 시 UI 재도입 여부는 미결이다.
  @Choice({
    Level: { value: MeViewOption.Level, nameLocalizations: { ko: '레벨' } },
    Voice: { value: MeViewOption.Voice, nameLocalizations: { ko: '음성' } },
    // pt-BR 이름은 두지 않는다(command-localizations 가드) — 값은 'recap' 으로 고정
    Recap: { value: MeViewOption.Recap, nameLocalizations: { ko: '결산' } },
  })
  @Param({
    name: 'view',
    nameLocalizations: { ko: '보기' },
    description: 'Card view: level (default), the legacy voice-time card, or the year-end recap',
    descriptionLocalizations: {
      ko: '카드 보기: 레벨(기본), 레거시 음성 시간 카드 또는 연말 결산',
      'pt-BR':
        'Visualização do cartão: nível (padrão), o cartão antigo de tempo de voz ou o resumo do ano',
    },
    required: false,
    type: ParamType.STRING,
  })
  view?: MeViewOption;
}
