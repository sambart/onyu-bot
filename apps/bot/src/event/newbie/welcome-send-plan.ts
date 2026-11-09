import { truncateWelcomeText, WELCOME_TEXT_LIMITS } from '@onyu/shared';

/** 환영 메시지 발송에 필요한 봇의 채널 권한 판정 결과(스레드 여부는 호출부가 SendMessages 계열로 환산한다). */
export interface WelcomeChannelPerms {
  canView: boolean;
  canSend: boolean;
  canEmbed: boolean;
  canAttach: boolean;
}

export type WelcomeDisplayMode = 'CANVAS' | 'EMBED';

export type WelcomeSendPlan = 'skip' | 'canvas' | 'embed' | 'text';

/** 텍스트-only 폴백에서 제목을 굵게 표시하는 마크다운 래퍼 */
const BOLD_MARK = '**';
const TEXT_ONLY_SEPARATOR = '\n\n';

/**
 * 발송 전 1회 권한 판정(사후 재시도 없음, EC-NEWBIE-51).
 * perms 가 null 이면(조회 불가) 현행 경로를 그대로 유지한다 — fail-open.
 */
export function resolveWelcomeSendPlan(
  perms: WelcomeChannelPerms | null,
  mode: WelcomeDisplayMode,
): WelcomeSendPlan {
  const isCanvas = mode === 'CANVAS';
  if (perms === null) return isCanvas ? 'canvas' : 'embed';
  if (!perms.canView || !perms.canSend) return 'skip';
  if (isCanvas && perms.canAttach) return 'canvas';
  return perms.canEmbed ? 'embed' : 'text';
}

/**
 * EmbedLinks 권한이 없을 때 임베드 대신 보내는 텍스트 본문을 만든다.
 * 빈 필드는 생략하고 2000 코드포인트로 잘라내며, 전부 비면 undefined.
 */
export function buildWelcomeTextOnly(parts: {
  content?: string;
  title?: string;
  description?: string;
}): string | undefined {
  const joined = [
    parts.content,
    parts.title ? `${BOLD_MARK}${parts.title}${BOLD_MARK}` : undefined,
    parts.description,
  ]
    .filter((part): part is string => part !== undefined && part.trim() !== '')
    .join(TEXT_ONLY_SEPARATOR);
  if (joined.trim() === '') return undefined;
  return truncateWelcomeText(joined, WELCOME_TEXT_LIMITS.content);
}
