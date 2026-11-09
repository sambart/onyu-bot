import {
  buildWelcomeMissionVars,
  stripUnfilledMissionLines,
  toOptionalText,
  WELCOME_MISSION_VAR_NAMES,
  type WelcomeMissionVarsInput,
} from '@onyu/shared';

/**
 * 환영 템플릿 유틸 shim — 구현은 `@onyu/shared`(웹 미리보기와 동일 로직 공유)로 이관됐다.
 * 기존 import 경로와 spec 을 보존하기 위한 재수출이다.
 */
export const MISSION_VAR_NAMES = WELCOME_MISSION_VAR_NAMES;
export const buildMissionVars = buildWelcomeMissionVars;
export { stripUnfilledMissionLines, toOptionalText };
export type MissionVarsConfig = WelcomeMissionVarsInput;
