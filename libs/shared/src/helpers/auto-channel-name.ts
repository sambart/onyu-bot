/**
 * 자동방(auto-channel) 채널명 조립 순수 로직 — `apps/api`(실제 생성)와 `apps/web`(미리보기)가
 * 공유하는 단일 정본이다.
 *
 * 원본은 `apps/api/src/channel/auto/application/auto-channel.service.ts` 의
 * `buildChannelName` / `buildInstantChannelName` 내부 순수 부분이며, web 이 이를 손으로
 * 복제하다 드리프트(치환 non-global, 기본형 문구 불일치 등)를 낸 사고를 계기로 이곳에 추출했다
 * (docs/plans/auto-channel-structure-preview.md §2).
 *
 * 이 모듈은 i18n 을 알지 않는다 — 로케일 기본형 문자열은 호출자가 이미 해석해 인자로 넘긴다.
 * `{n}` 넘버링(`resolveChannelName`)은 Discord 채널 목록 조회에 의존하는 I/O 로직이라
 * 공유 대상이 아니다.
 */

/** 확정방(select 모드) 채널명 조립 입력. 템플릿 미설정은 null 또는 ''로 전달한다. */
export interface AutoChannelNameParts {
  /** 버튼의 channelNameTemplate. 미설정 시 null/'' */
  buttonTemplate: string | null | undefined;
  /** 버튼 템플릿 미설정 시 적용할 로케일 기본형 — {label} 치환이 끝난 문자열 */
  defaultButtonTemplate: string;
  /** 하위 선택지 channelNameTemplate. 없으면 undefined/null/'' */
  subOptionTemplate?: string | null;
  /** {username} 에 넣을 값 (실제=서버 닉네임 / 미리보기=예시 인물명) */
  userName: string;
}

/**
 * F-VOICE-011 확정방 채널명 조립 (넘버링 이전 단계).
 *
 * subOptionTemplate 이 truthy 면 `{name}`(버튼 기본 이름) + `{username}` 치환 결과를 반환하고,
 * 아니면 버튼 기본 이름을 그대로 반환한다.
 */
export function buildAutoChannelBaseName(parts: AutoChannelNameParts): string {
  // '' 도 "미설정"으로 취급해야 하므로 ?? 가 아닌 빈 문자열 분기를 쓴다
  const rawButtonTemplate = parts.buttonTemplate ?? '';
  const buttonTemplate = rawButtonTemplate === '' ? parts.defaultButtonTemplate : rawButtonTemplate;
  const baseName = buttonTemplate.replace(/{username}/g, parts.userName);

  if (parts.subOptionTemplate) {
    return parts.subOptionTemplate
      .replace(/{name}/g, baseName)
      .replace(/{username}/g, parts.userName);
  }

  return baseName;
}

/**
 * F-VOICE-020 즉시 생성 채널명 조립. template 미설정 시 defaultTemplate 사용.
 */
export function buildInstantChannelBaseName(
  template: string | null | undefined,
  defaultTemplate: string,
  userName: string,
): string {
  // '' 도 "미설정"으로 취급해야 하므로 ?? 가 아닌 빈 문자열 분기를 쓴다
  const rawTemplate = template ?? '';
  return (rawTemplate === '' ? defaultTemplate : rawTemplate).replace(/{username}/g, userName);
}

/** 템플릿에 {n} 이 포함되는지 (미리보기 보조 텍스트 판단용). */
export function hasAutoNumberToken(template: string): boolean {
  return template.includes('{n}');
}
