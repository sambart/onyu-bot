import type { NewbieConfigDto } from '@onyu/bot-api-client';

/**
 * F-NEWBIE-009 — 환영 템플릿 미션 안내 변수명(조건부 렌더 판정 대상 고정 목록, 계획 §S1-2).
 * `applyTemplate`이 치환하는 다른 변수(`username`/`mention`/`memberCount`/`serverName`)는
 * 이 목록에 관여하지 않는다.
 */
export const MISSION_VAR_NAMES = [
  'missionTargetPlaytime',
  'missionTargetPlayCount',
  'missionDurationDays',
  'missionChannel',
] as const;

type MissionVarName = (typeof MISSION_VAR_NAMES)[number];

/** buildMissionVars 입력 — NewbieConfigDto 중 미션 변수 조립에 필요한 필드만 취한다. */
export type MissionVarsConfig = Pick<
  NewbieConfigDto,
  | 'missionEnabled'
  | 'missionTargetPlaytimeHours'
  | 'missionTargetPlayCount'
  | 'missionDurationDays'
  | 'missionNotifyChannelId'
>;

/**
 * F-NEWBIE-009 — 미션 설정으로 환영 템플릿 변수 4개를 구성한다.
 *
 * 봇은 길드(서버) 로케일을 알 수 없다 — `LocaleResolverService`(apps/bot)는 의도적으로 사용자
 * 로케일만 다루며 서버 언어 설정을 봇 응답 언어 결정에 관여시키지 않는다(F-GENERAL-004/005
 * 불변 원칙). Canvas 카드처럼 길드 로케일을 알아야 하는 생성물은 API가 대신 해석하지만
 * (`bot-newbie.controller.ts`의 `localeResolver.getGuildLocale`), 환영 Embed 템플릿 변수
 * 치환은 봇에서 직접 일어나 이 경로를 타지 않는다.
 *
 * 그래서 값은 **단위 없는 순수 숫자/멘션**만 반환하고, 단위(시간/일/회) 문구는 기본 템플릿
 * 문장 쪽(S1-3)에 고정 텍스트로 둔다 — 계획 §5 미결 1의 두 대안 중 채택안(대안 B).
 */
export function buildMissionVars(config: MissionVarsConfig): Record<MissionVarName, string> {
  const enabled = config.missionEnabled;

  return {
    missionTargetPlaytime:
      enabled && config.missionTargetPlaytimeHours != null
        ? String(config.missionTargetPlaytimeHours)
        : '',
    missionTargetPlayCount:
      enabled && config.missionTargetPlayCount != null ? String(config.missionTargetPlayCount) : '',
    missionDurationDays:
      enabled && config.missionDurationDays != null ? String(config.missionDurationDays) : '',
    missionChannel:
      enabled && config.missionNotifyChannelId ? `<#${config.missionNotifyChannelId}>` : '',
  };
}

/**
 * F1(계획 review-575-followup §2-1 C) — 전처리(stripUnfilledMissionLines 등) 결과가
 * 공백뿐이면 `undefined` 를 반환한다. 호출부는 이 값으로 `EmbedBuilder.setTitle`/
 * `setDescription`/`channel.send`의 `content` 필드 호출 여부를 결정한다 — discord.js
 * validator가 빈 문자열 setter 호출에서 throw하는 것을 원천 차단하기 위함이다.
 */
export function toOptionalText(value: string): string | undefined {
  return value.trim() === '' ? undefined : value;
}

/**
 * F-NEWBIE-009 — 치환 전 줄 단위 전처리(계획 §S1-2 조건부 렌더 설계).
 *
 * 각 줄이 포함한 미션 변수 중 값이 빈 문자열인 것이 하나라도 있으면 그 줄을 통째로 삭제한다.
 * 미션 변수를 전혀 포함하지 않는 줄은 이 판정에 전혀 관여하지 않는다 — 기존 길드 템플릿 동작이
 * 완전히 무변경으로 보존된다(회귀 가드).
 *
 * 실제로 삭제가 발생했을 때만 연속 빈 줄을 1개로 축약하고 앞뒤 공백을 trim한다(삭제로 남은
 * `\n\n` 잔여물 정리). 삭제가 전혀 없었다면 원본 문자열을 바이트 단위 그대로 반환한다 —
 * 미션 변수와 무관한 템플릿에 원래 있던 공백 구조(의도적인 여러 줄 공백 등)를 건드리지
 * 않기 위함이다.
 */
export function stripUnfilledMissionLines(
  template: string,
  missionVarNames: readonly string[],
  vars: Record<string, string>,
): string {
  const lines = template.split('\n');
  let removed = false;

  const kept = lines.filter((line) => {
    const hasUnfilledMissionVar = missionVarNames.some(
      (name) => vars[name] === '' && line.includes(`{${name}}`),
    );
    if (hasUnfilledMissionVar) removed = true;
    return !hasUnfilledMissionVar;
  });

  if (!removed) return template;

  const collapsed: string[] = [];
  for (const line of kept) {
    const isBlank = line.trim() === '';
    const prevIsBlank = collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === '';
    if (isBlank && prevIsBlank) continue;
    collapsed.push(line);
  }

  return collapsed.join('\n').trim();
}
