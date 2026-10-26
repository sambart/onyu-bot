import { Param, ParamType } from '@discord-nestjs/core';

/**
 * `/관리도우미` 질의 옵션(F-ADMIN-ASSIST-078). `setMaxLength`는 **UX 용 조기 차단이지
 * 방어선이 아니다** — 최종 방어선은 API `BotAdminAssistRecommendDto.queryText`(서버 재검증,
 * `QUERY_TEXT_MAX_LENGTH=500`)다. 같은 값을 두 파일에 적어 두지만(bot은 API 상수를 import할
 * 수 없다), 값이 갈리면 API 쪽이 최종 판정한다(endpoint-spec §5E-2).
 */
const QUERY_TEXT_MAX_LENGTH = 500;

export class AdminAssistCommandDto {
  @Param({
    name: 'query',
    nameLocalizations: { ko: '질문' },
    description: 'What do you want to know or set up?',
    descriptionLocalizations: {
      ko: '무엇을 설정하거나 알고 싶으신가요?',
      'pt-BR': 'O que você quer saber ou configurar?',
    },
    required: true,
    type: ParamType.STRING,
    maxLength: QUERY_TEXT_MAX_LENGTH,
  })
  query: string;
}
