/**
 * AI 페르소나(말투) 닫힌 enum — U8-B2 에서 web 로컬(`my/premium/lib/ai-personas.ts`)로부터 승격(F-SUB-034·036).
 * API 가 저장값 검증·렌더 합성에 소비하고 웹이 선택 UI 에 소비하는 앱 간 계약이다.
 *
 * 표시명·톤·예시 문구는 코드에 두지 않는다 — `libs/i18n/locales/{ko,en}/web/dashboard.json`
 * 의 `me.premium.persona.{names,tones,samples}.*` 로케일 자산이다.
 * 말투 지시문(LLM 프롬프트)은 서버 상수이며 클라이언트가 자유 텍스트를 주입할 수 없다(영구 정책 — premium-policy §6.2).
 */

/** AI 페르소나(말투) 키 — 닫힌 enum. 자유 텍스트 입력은 영구 금지. */
export type AiPersonaKey = 'neutral' | 'friendly' | 'butler' | 'hype' | 'dry' | 'analyst';

/** 표시 순서 = 배열 순서(런타임 정렬 로직 금지). */
export const AI_PERSONA_KEYS: readonly AiPersonaKey[] = [
  'neutral',
  'friendly',
  'butler',
  'hype',
  'dry',
  'analyst',
] as const;

/** 기본값 — `user_preference."aiPersona"` DDL DEFAULT 와 철자가 일치해야 한다(통합 TC 로 고정). */
export const DEFAULT_AI_PERSONA: AiPersonaKey = 'neutral';

/** 저장값·요청값 검증용 타입 가드. */
export function isAiPersonaKey(value: unknown): value is AiPersonaKey {
  return typeof value === 'string' && (AI_PERSONA_KEYS as readonly string[]).includes(value);
}
