export * from './auto-channel-name';
export * from './channel-obfuscation';
export * from './interpolate';
export * from './level-announce-template';
export * from './level-curve';
export * from './level-no-xp-share';
export * from './level-xp-multiplier';
export * from './locale-table';
export * from './weekly-report-snapshot-mask.util';

/** 오늘 날짜를 YYYYMMDD 형식 문자열로 반환한다 (로컬 시간 기준) */
export function todayYYYYMMDD(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 주어진 날짜를 YYYYMMDD 형식 문자열로 반환한다 (KST 기준).
 * 인자를 생략하면 현재 시각(now) 기준으로 반환한다 (기존 호출부 하위호환).
 */
export function getKSTDateString(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}

/** 오늘 날짜를 YYYYMMDD 형식 문자열로 반환한다 (UTC 기준) */
export function getUTCDateString(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/** 문자열을 최대 길이로 자르고 말줄임표를 추가한다 */
export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

/**
 * 서로게이트 페어를 반으로 자르지 않는 코드포인트 단위 절단(F-COPRESENCE-033 수리, D13).
 * `String.prototype.slice`는 UTF-16 코드유닛 단위라 이모지 등 서로게이트 페어의 앞쪽에서
 * 잘리면 lone surrogate(`�`)가 남는다 — 그 결과가 카드에 렌더되고 이력에 저장돼 다음 회차
 * 프롬프트로 재주입되며 오염이 전파된다. best-friend·me-ment·admin-assist(공지·규칙 초안
 * 게시·봇 Embed 절단) 서버측 truncate 전부에 공용으로 쓴다. `apps/api`(voice-analytics·
 * admin-assist·common/admin-log)와 `apps/bot`(admin-assist Embed 빌더) 양쪽 소비를 위해
 * `libs/shared` 로 승격됐다(admin-assist-bot-entrypoint 계획 §5-1 ⓒ) — `apps/api/src/common/
 * util/text.util.ts`는 이 함수를 재수출로 축소한다(단일 정본 유지).
 * 🔒 코드포인트 기준이므로 ZWJ 이모지 시퀀스(가족 이모지 등)는 여전히 중간에서 갈릴 수
 * 있으나, 그 결과는 유효한 이모지 조각들이지 lone surrogate가 아니므로 렌더·저장 오염이
 * 없다 — grapheme cluster 단위(`Intl.Segmenter`) 절단은 과잉으로 판단해 채택하지 않는다.
 *
 * 🔒 말줄임표를 붙이지 않는다 — 호출측이 필요하면 `+ ELLIPSIS`를 붙이는 기존 계약을
 * 유지한다(voice-ai-analysis.service.ts 선례). 유틸에 말줄임표 로직을 얹지 않는다.
 */
export function truncateByCodePoint(text: string, maxChars: number): string {
  const codePoints = Array.from(text);
  return codePoints.length <= maxChars ? text : codePoints.slice(0, maxChars).join('');
}

/** 문자열을 최대 길이 단위로 분할한다 */
export function splitMessage(text: string, max: number): string[] {
  const chunks: string[] = [];
  let i = 0;

  while (i < text.length) {
    chunks.push(text.slice(i, i + max));
    i += max;
  }

  return chunks;
}

/**
 * 줄 단위로 텍스트를 분할하여 마크다운 구조를 보존한다.
 * 각 청크가 maxLength 이하가 되도록 줄(\n) 경계에서 분할한다.
 */
export function splitByLines(text: string, maxLength: number): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? current + '\n' + line : line;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
