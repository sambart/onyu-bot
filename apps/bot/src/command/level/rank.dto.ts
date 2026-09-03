import { Param, ParamType } from '@discord-nestjs/core';

/**
 * `/rank` 선택 옵션 `user`(F-LVL-24/25, U9) — 코드베이스 관례(`best-friend.dto.ts`)를 따라
 * base 이름은 반드시 영문(`user`)이어야 한다. `interaction.options.getUser()`는 base 이름으로
 * 조회하므로, 한글 이름(`유저`)을 base로 두면 항상 `null`이 반환되어 타인 조회가 전부
 * "비멤버"로 오분류된다(F2/R4 — rank-command.md 계획 §0·§10 참조).
 */
export class RankCommandDto {
  @Param({
    name: 'user',
    nameLocalizations: { ko: '유저' },
    description: 'Check this member level rank card (default: yourself)',
    descriptionLocalizations: { ko: '이 멤버의 레벨 랭크 카드를 확인합니다(기본값: 본인)' },
    required: false,
    type: ParamType.USER,
  })
  user?: string;
}
