import { Param, ParamType } from '@discord-nestjs/core';

/**
 * `/궁합` 필수 옵션 `상대`(`peer`, F-COPRESENCE-036).
 * USER 옵션의 `.value` 는 snowflake string 이다 — 표시명·아바타는 핸들러에서
 * `interaction.options.getUser('peer', true)` 로 얻는다.
 */
export class CompatCommandDto {
  @Param({
    name: 'peer',
    nameLocalizations: { ko: '상대' },
    description: "Member to check today's ship score with",
    descriptionLocalizations: {
      ko: '오늘의 궁합을 볼 멤버',
      'pt-BR': 'Membro para ver o match do dia',
      ja: '今日の相性を見るメンバー',
    },
    required: true,
    type: ParamType.USER,
  })
  peer: string;
}
