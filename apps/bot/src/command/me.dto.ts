import { Choice, Param, ParamType } from '@discord-nestjs/core';

/** `/미 보기` 옵션 값 (F-VOICE-066) */
export enum MeViewOption {
  Level = 'level',
  Voice = 'voice',
  /** 연말 결산(F-RECAP, 2026-12-15~2027-01-15 노출 창) */
  Recap = 'recap',
  /** 뱃지 컬렉션(10종 전량 — 카드는 상위 K개 요약, F-VOICE-075 R8) */
  Badges = 'badges',
}

export class MeCommandDto {
  // 멘트는 옵션이 아니다: 레이아웃 A 렌더 시 항상 자동 요청한다(F-VOICE-079 후속 개정, 2026-07-30).
  // 흥미용(AI 페르소나, premium-policy §6.2) 개방 시 UI 재도입 여부는 미결이다.
  @Choice({
    Level: { value: MeViewOption.Level, nameLocalizations: { ko: '레벨' } },
    Voice: { value: MeViewOption.Voice, nameLocalizations: { ko: '음성' } },
    // pt-BR 이름은 두지 않는다(command-localizations 가드) — 값은 'recap' 으로 고정
    Recap: { value: MeViewOption.Recap, nameLocalizations: { ko: '결산' } },
    // pt-BR·ja 이름은 두지 않는다(command-localizations 가드) — 값은 'badges' 로 고정
    Badges: { value: MeViewOption.Badges, nameLocalizations: { ko: '뱃지' } },
  })
  @Param({
    name: 'view',
    nameLocalizations: { ko: '보기' },
    description:
      'Card view: level (default), legacy voice-time card, year-end recap, or badge collection',
    descriptionLocalizations: {
      ko: '카드 보기: 레벨(기본), 레거시 음성 시간 카드, 연말 결산 또는 뱃지 컬렉션',
      'pt-BR': 'Cartão: nível (padrão), voz (antigo), resumo do ano ou coleção de emblemas',
      ja: 'カードの種類：レベル（デフォルト）、旧ボイス時間カード、年末の振り返り、バッジコレクション',
    },
    required: false,
    type: ParamType.STRING,
  })
  view?: MeViewOption;
}
