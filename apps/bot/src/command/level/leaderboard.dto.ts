import { Param, ParamType } from '@discord-nestjs/core';

/** 리더보드 페이지 최소값 — Discord 클라이언트가 `minValue` 미만 입력을 사전 차단한다 */
const MIN_PAGE = 1;

/**
 * `/랭킹` 선택 옵션 `page`(F-LVL-26, U9) — base 이름은 영문(`page`)이어야 한다(F2, `rank.dto.ts`와
 * 동일 원칙). 미지정 시 API 기본값(1페이지)으로 조회한다.
 */
export class LeaderboardCommandDto {
  @Param({
    name: 'page',
    nameLocalizations: { ko: '페이지' },
    description: 'Leaderboard page number (default: 1)',
    descriptionLocalizations: { ko: '리더보드 페이지 번호(기본값: 1)' },
    required: false,
    type: ParamType.INTEGER,
    minValue: MIN_PAGE,
  })
  page?: number;
}
