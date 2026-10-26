import type {
  AdminAssistAnalysis,
  AdminAssistDiagnosis,
  AdminAssistDiagnosisStatus,
  AdminAssistExplanation,
  AdminAssistFallback,
  AdminAssistGeneration,
  AdminAssistParameter,
  AdminAssistRecommendation,
  AdminAssistRecommendResponse,
} from '@onyu/shared';
import {
  BRAND_INT,
  isAdminAssistExecutableActionId,
  parseLocale,
  pickLocale,
  toPublicContentLocale,
  truncateByCodePoint,
} from '@onyu/shared';
import { EmbedBuilder, embedLength } from 'discord.js';

import type { BotI18nService } from '../../common/application/bot-i18n.service';

/** Discord Embed description 상한(4096자) — `admin-assist-publish.service.ts:30` 관례 계승 */
const EMBED_DESCRIPTION_MAX = 4096;
/** Discord Embed field value 상한(1024자) */
const EMBED_FIELD_VALUE_MAX = 1024;
/**
 * Discord Embed 총량 상한(title+description+모든 field name/value+footer+author 합, 6000자).
 * 부분별(description/field) 상한은 각각 지켜도 여러 부분이 합쳐지면 이 총량을 넘을 수 있다 —
 * 그러면 editReply 자체가 Discord API 에 거부되는데, 이미 API 호출(쿼터 소모)은 끝난 뒤라
 * 사용자는 결과 없이 일반 오류만 본다(#659 리뷰 지적). `embedLength`는 discord.js 가
 * `@discordjs/builders` 를 재수출하는 헬퍼로, Discord 가 세는 방식과 동일하게 계산한다.
 */
const EMBED_TOTAL_MAX_LENGTH = 6000;
const ELLIPSIS = '…';
const ELLIPSIS_LEN = ELLIPSIS.length;
/** 필드에 나열할 파라미터/예시/후속질문 최대 줄 수(폭주 방지) */
const MAX_BULLET_LINES = 8;
/** 총량 절단 안내 힌트 필드 이름 — `setTruncatedDescription`과 공유(중복 필드 방지) */
const TRUNCATION_HINT_FIELD_NAME = '—';
/** 지원 언어 안내 필드 이름(F-ADMIN-ASSIST-086) — 링크 필드 '🔗' 관례와 같은 아이콘 라벨 */
const UNSUPPORTED_LANGUAGE_FIELD_NAME = '🌐';
/** 입력 안내 필드 이름(F-ADMIN-ASSIST-092) — 같은 아이콘 라벨 관례 */
const CAPABILITY_HINT_FIELD_NAME = '💡';
/** Phase 3 승인-실행 웹 안내 필드 이름(F-ADMIN-ASSIST-109) — 같은 아이콘 라벨 관례 */
const APPLY_ON_WEB_HINT_FIELD_NAME = '🖥️';
/** C-lite 설명·(b1) 상태 점검 필드 이름 아이콘(F-ADMIN-ASSIST-094·095) — 같은 아이콘 라벨 관례 */
const EXPLANATION_FIELD_ICON = '📘';
const TROUBLESHOOTING_FIELD_ICON = '🧰';
const DIAGNOSIS_FIELD_ICON = '🩺';
/** 상태 점검 항목 상태 아이콘 — 웹은 같은 상태를 텍스트 라벨(a11y)로 렌더한다 */
const DIAGNOSIS_STATUS_ICON: Record<AdminAssistDiagnosisStatus, string> = {
  issue: '⚠️',
  ok: '✅',
  check: '🔍',
  info: 'ℹ️',
};
/** 멤버 본인 확인 경로 안내 줄 아이콘 */
const SELF_CHECK_HINT_ICON = '👤';
/** 서버가 내린 가이드 슬러그를 URL 에 넣기 전 형식 방어(소문자·숫자·하이픈만) */
const GUIDE_SLUG_PATTERN = /^[a-z0-9-]+$/;
/** 미검증 파라미터 값 표시 — removeUnvalidatedParameterField 가 같은 상수로 판정한다 */
const PARAMETER_EMPTY_VALUE = '—';

export interface AdminAssistEmbedContext {
  locale: string;
  i18n: BotI18nService;
  webUrl: string;
  guildId: string;
}

/**
 * 관리 어시스턴트(E8) 응답 → Embed 4분기 조립(admin-assist-bot-entrypoint 계획 §9-4). 순수
 * 함수 — 외부 상태를 읽거나 바꾸지 않고 같은 입력에 같은 출력을 낸다(테스트 용이).
 *
 * 🔒 **HTTP 200 ≠ 결과 성공** — 이 도메인은 LLM 실패(`llm_error`)를 200 으로 내린다. 반드시
 * `resultStatus` 를 먼저 보고 분기해야 한다(§9-3). 이 함수가 그 분기를 전담한다.
 */
export function buildAdminAssistEmbed(
  response: AdminAssistRecommendResponse,
  context: AdminAssistEmbedContext,
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(BRAND_INT);
  let settingsDeepLinkRelative: string | undefined;
  let guideLinkLine: string | undefined;

  if (response.resultStatus === 'llm_error') {
    embed.setDescription(context.i18n.t(context.locale, 'commands.adminAssistError'));
  } else if (response.resultStatus === 'no_match' || response.resultStatus === 'rejected') {
    settingsDeepLinkRelative = applyFallback(embed, response.fallback, context);
  } else {
    // success | partial_success — kind 로 2차 분기(웹과 동일한 2단 분기, §2A-1)
    switch (response.kind) {
      case 'setting':
        settingsDeepLinkRelative = applyRecommendation(embed, response.recommendation, context);
        // C-lite(F-094) — 설명·체크리스트·가이드 링크는 응답에 explanation 이 있을 때만 붙는다.
        // 없는 응답은 Embed 가 개정 전과 바이트 동일하다.
        if (response.recommendation && response.explanation) {
          guideLinkLine = applyExplanation(embed, response.explanation, context);
        }
        applyWebApplyHint(embed, response, context);
        break;
      case 'recipe':
        applyAnalysis(embed, response.analysis, response.resultStatus, context);
        break;
      case 'generative':
        applyGeneration(embed, response.generation, context);
        break;
      default:
        // 방어적 분기 — 계약상 도달 불가(success/partial_success 는 항상 kind 를 동반한다)
        embed.setDescription(context.i18n.t(context.locale, 'commands.adminAssistError'));
    }
  }

  // F-ADMIN-ASSIST-092(7차 A6 · D2 (b)) — no_match 에 입력 안내 1줄(웹 capabilityHint 문구 +
  // 입력 예시). 봇 표면 no_match 5건 중 4건이 한 단어 입력이었다(`canal`·`help`·`mic`·`ji`).
  // 총량 보정(enforceEmbedTotalLength)이 줄이지 않는 필드라 절단으로 사라지지 않는다(~120자).
  if (response.resultStatus === 'no_match') {
    embed.addFields({
      name: CAPABILITY_HINT_FIELD_NAME,
      value: context.i18n.t(context.locale, 'commands.adminAssistCapabilityHint'),
    });
  }

  // F-ADMIN-ASSIST-086(6차 D3 (b)) — 웹과 같은 응답 계약. 서버가 내린 판정만 보고 문구는
  // 봇 i18n 에서 렌더한다(응답 언어는 그대로). 총량 보정(enforceEmbedTotalLength)이 줄이지
  // 않는 필드라 절단으로 사라지지 않는다.
  if (response.isQueryLanguageUnsupported === true) {
    embed.addFields({
      name: UNSUPPORTED_LANGUAGE_FIELD_NAME,
      value: context.i18n.t(context.locale, 'commands.adminAssistUnsupportedLanguageNotice'),
    });
  }

  const extraLinkLines = [
    ...(settingsDeepLinkRelative ? [`${context.webUrl}${settingsDeepLinkRelative}`] : []),
    ...(guideLinkLine ? [guideLinkLine] : []),
  ];
  const followUpFieldIndex = addFooter(embed, response.followUpQueries, extraLinkLines, context);
  enforceEmbedTotalLength(embed, followUpFieldIndex, context);
  return embed;
}

/** @returns 설정 딥링크(상대경로) — 존재하면 하단 footer 가 절대경로로 붙인다 */
function applyRecommendation(
  embed: EmbedBuilder,
  recommendation: AdminAssistRecommendation | null,
  context: AdminAssistEmbedContext,
): string | undefined {
  if (!recommendation) {
    embed.setDescription(context.i18n.t(context.locale, 'commands.adminAssistError'));
    return undefined;
  }

  embed.setTitle(recommendation.title);
  setTruncatedDescription(embed, recommendation.description, context);

  if (recommendation.parameters.length > 0) {
    embed.addFields({
      name: recommendation.title,
      value: truncateField(formatParameters(recommendation.parameters)),
    });
  }

  // (b1) 상태 점검(F-095) — 진단기 보유 항목의 success 응답에만 온다(intent 무관).
  if (recommendation.diagnosis) {
    embed.addFields({
      name: `${DIAGNOSIS_FIELD_ICON} ${context.i18n.t(context.locale, 'commands.adminAssistDiagnosisLabel')}`,
      value: truncateField(formatDiagnosis(recommendation.diagnosis, context)),
    });
  }

  return recommendation.settingsDeepLink;
}

/**
 * Phase 3 승인-실행 안내(F-ADMIN-ASSIST-109, UC-12) — 웹에서 승인·적용할 수 있는 3항목의 setting 성공 카드에만
 * "웹 대시보드에서 변경 내용을 확인하고 적용" 1줄을 붙인다. 봇은 **실행하지 않는다**: 봇 표면 응답에는
 * proposal 이 없고 E9 호출도 0이다(T-7). 설명 카드(`explanation`)에는 붙이지 않는다(EC-AA-479 축소).
 * 총량 보정(enforceEmbedTotalLength)이 줄이지 않는 단문 필드다.
 */
function applyWebApplyHint(
  embed: EmbedBuilder,
  response: AdminAssistRecommendResponse,
  context: AdminAssistEmbedContext,
): void {
  const recommendation = response.recommendation;
  if (
    response.resultStatus !== 'success' ||
    !recommendation ||
    response.explanation ||
    !isAdminAssistExecutableActionId(recommendation.actionId)
  ) {
    return;
  }
  embed.addFields({
    name: APPLY_ON_WEB_HINT_FIELD_NAME,
    value: context.i18n.t(context.locale, 'commands.adminAssistApplyOnWebHint'),
  });
}

/**
 * C-lite 설명 슬롯(F-ADMIN-ASSIST-094) — 설명 필드 + (있으면) 정적 체크리스트 필드를 덧붙인다.
 * 설명형 카드는 "제안값 대신 설명"이라, 파라미터가 전부 미검증("—")이면 파라미터 필드를
 * 뺀다(웹 RecommendationCard 와 같은 규칙).
 *
 * @returns 가이드 링크 1줄(슬러그가 있을 때만) — 하단 🔗 필드에 함께 붙는다
 */
function applyExplanation(
  embed: EmbedBuilder,
  explanation: AdminAssistExplanation,
  context: AdminAssistEmbedContext,
): string | undefined {
  removeUnvalidatedParameterField(embed);
  embed.addFields({
    name: `${EXPLANATION_FIELD_ICON} ${context.i18n.t(context.locale, 'commands.adminAssistExplanationLabel')}`,
    value: truncateField(explanation.body),
  });
  if (explanation.troubleshooting.length > 0) {
    embed.addFields({
      name: `${TROUBLESHOOTING_FIELD_ICON} ${context.i18n.t(context.locale, 'commands.adminAssistTroubleshootingLabel')}`,
      value: truncateField(
        explanation.troubleshooting
          .slice(0, MAX_BULLET_LINES)
          .map((line) => `• ${line}`)
          .join('\n'),
      ),
    });
  }
  if (explanation.guideSlug === null || !GUIDE_SLUG_PATTERN.test(explanation.guideSlug)) {
    return undefined;
  }
  // 공개 콘텐츠가 없는 로케일(2군)은 en 가이드로 접는다. pt 는 공개 콘텐츠가 있어 `/pt`(웹 접두 정본
  // `public-locale-paths.ts` 와 같은 값 — 봇은 웹 모듈을 import 할 수 없어 표로 둔다, 비텍스트 경로)
  const localePrefix = pickLocale(toPublicContentLocale(parseLocale(context.locale)), {
    ko: '',
    en: '/en',
    pt: '/pt',
  });
  return context.i18n.t(context.locale, 'commands.adminAssistGuideLink', {
    url: `${context.webUrl}${localePrefix}/guides/${explanation.guideSlug}`,
  });
}

/**
 * 파라미터 필드(이름 = 카드 제목, applyRecommendation 이 추가)의 값이 전부 미검증("—")이면
 * 제거한다. 하나라도 검증된 값이 있으면 그대로 둔다.
 */
function removeUnvalidatedParameterField(embed: EmbedBuilder): void {
  const fields = embed.data.fields ?? [];
  const index = fields.findIndex((field) => field.name === embed.data.title);
  if (index === -1) return;
  const isAllUnvalidated = fields[index].value
    .split('\n')
    .every((line) => line.endsWith(`: ${PARAMETER_EMPTY_VALUE}`));
  if (isAllUnvalidated) embed.spliceFields(index, 1);
}

/** (b1) 상태 점검 줄 — 상태 아이콘 + 서버 조립 문장. unavailable 이면 안내 1줄을 앞에 둔다 */
function formatDiagnosis(
  diagnosis: AdminAssistDiagnosis,
  context: AdminAssistEmbedContext,
): string {
  const lines = diagnosis.items
    .slice(0, MAX_BULLET_LINES)
    .map((item) => `${DIAGNOSIS_STATUS_ICON[item.status]} ${item.text}`);
  if (diagnosis.outcome === 'unavailable') {
    lines.unshift(context.i18n.t(context.locale, 'commands.adminAssistDiagnosisUnavailable'));
  }
  if (diagnosis.selfCheckHint) lines.push(`${SELF_CHECK_HINT_ICON} ${diagnosis.selfCheckHint}`);
  return lines.join('\n');
}

/**
 * 해석 문단 자리의 문구. 해석이 null 인 사유를 구분한다 — 서버가 해석 콜을 의도적으로 건너뛴
 * 정상 부재(`success` + `no_comparable_data`)를 "해석 실패"로 오표시하지 않는다(8차 A4).
 */
function resolveAnalysisDescription(
  analysis: AdminAssistAnalysis,
  resultStatus: 'success' | 'partial_success',
  context: AdminAssistEmbedContext,
): string {
  // partial_success(B4) — 해석 콜만 실패. 수치만 + 안내 1줄(§2A-5)
  if (resultStatus === 'partial_success') {
    return context.i18n.t(context.locale, 'commands.adminAssistPartialNotice');
  }
  if (analysis.interpretation) return analysis.interpretation;
  return analysis.notices.includes('no_comparable_data')
    ? context.i18n.t(context.locale, 'commands.adminAssistNoComparableData')
    : context.i18n.t(context.locale, 'commands.adminAssistPartialNotice');
}

function applyAnalysis(
  embed: EmbedBuilder,
  analysis: AdminAssistAnalysis | null,
  resultStatus: 'success' | 'partial_success',
  context: AdminAssistEmbedContext,
): void {
  if (!analysis) {
    embed.setDescription(context.i18n.t(context.locale, 'commands.adminAssistError'));
    return;
  }

  embed.setTitle(analysis.title);

  const metricLines = formatAnalysisMetrics(analysis);
  if (metricLines.length > 0) {
    embed.addFields({ name: analysis.title, value: truncateField(metricLines.join('\n')) });
  }

  setTruncatedDescription(
    embed,
    resolveAnalysisDescription(analysis, resultStatus, context),
    context,
  );
}

function applyGeneration(
  embed: EmbedBuilder,
  generation: AdminAssistGeneration | null,
  context: AdminAssistEmbedContext,
): void {
  if (!generation) {
    embed.setDescription(context.i18n.t(context.locale, 'commands.adminAssistError'));
    return;
  }

  embed.setTitle(generation.title);
  setTruncatedDescription(embed, generation.draft.body, context);

  // 🔒 게시 버튼·채널 선택 진입점을 절대 추가하지 않는다(read-only, B12, F-078 비범위 ②)
  embed.addFields({
    name: context.i18n.t(context.locale, 'commands.adminAssistPublishHint'),
    value: buildDashboardUrl(context),
  });
}

/** @returns suggestedAction 딥링크(상대경로, non-null 일 때만) */
function applyFallback(
  embed: EmbedBuilder,
  fallback: AdminAssistFallback | null,
  context: AdminAssistEmbedContext,
): string | undefined {
  if (!fallback) {
    embed.setDescription(context.i18n.t(context.locale, 'commands.adminAssistError'));
    return undefined;
  }

  // F-018 — 지원 기능 목록(supportedExamples)은 별도 필드가 아니라 설명문에 함께 담는다
  // (전용 i18n 라벨을 새로 만들지 않기 위함 — followUpQueries 와는 의미가 달라 라벨 공유 금지).
  const exampleLines =
    fallback.supportedExamples.length > 0
      ? fallback.supportedExamples.slice(0, MAX_BULLET_LINES).map((q) => `• ${q}`)
      : [];
  // F-ADMIN-ASSIST-087(A3 A+) — 서버가 "미지원 기능 요청 + 이력 기록 성공"을 판정했을 때만 1줄.
  const requestLoggedLine =
    fallback.isUnsupportedRequestLogged === true
      ? context.i18n.t(context.locale, 'commands.adminAssistRequestLogged')
      : null;
  const descriptionParts = [
    fallback.generatedGuidance,
    requestLoggedLine,
    exampleLines.join('\n'),
  ].filter((part): part is string => Boolean(part));
  if (descriptionParts.length > 0) {
    setTruncatedDescription(embed, descriptionParts.join('\n\n'), context);
  }

  // 🔒 suggestedAction 이 non-null 이면 서버가 조립해 준 딥링크를 그대로 쓴다 — 봇이 경로를
  // 조립하지 않는다(B5, endpoint-spec §10 #81 계승)
  return fallback.suggestedAction?.settingsDeepLink;
}

/** description 을 4096자 코드포인트 절단 + 초과 시 안내 라인 추가 */
function setTruncatedDescription(
  embed: EmbedBuilder,
  text: string,
  context: AdminAssistEmbedContext,
): void {
  if (text.length <= EMBED_DESCRIPTION_MAX) {
    embed.setDescription(text);
    return;
  }
  embed.setDescription(truncateToUtf16Limit(text, EMBED_DESCRIPTION_MAX));
  embed.addFields({
    name: TRUNCATION_HINT_FIELD_NAME,
    value: context.i18n.t(context.locale, 'commands.adminAssistTruncatedHint'),
  });
}

/**
 * 말줄임표 포함 결과의 UTF-16 길이(`.length`)가 limit 이하가 되도록 코드포인트 단위로 절단한다.
 * 이모지 같은 서로게이트 쌍은 쪼개지 않고, 코드포인트 수가 아니라 UTF-16 길이로 한도를 판정한다.
 */
function truncateToUtf16Limit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const budget = limit - ELLIPSIS.length;
  let result = '';
  for (const codePoint of text) {
    if (result.length + codePoint.length > budget) break;
    result += codePoint;
  }
  return `${result}${ELLIPSIS}`;
}

/** field value 를 1024 UTF-16 길이 이하로 절단(서로게이트 쌍 보존, T7) */
function truncateField(text: string): string {
  return truncateToUtf16Limit(text, EMBED_FIELD_VALUE_MAX);
}

function formatParameters(parameters: AdminAssistParameter[]): string {
  return parameters
    .slice(0, MAX_BULLET_LINES)
    .map((p) => `• ${p.label}: ${p.value === null ? PARAMETER_EMPTY_VALUE : String(p.value)}`)
    .join('\n');
}

/** `AdminAssistAnalysis` 5종 레시피별 수치 요약 라인(F-005 — LLM 미개입 사전계산값 그대로 표시) */
function formatAnalysisMetrics(analysis: AdminAssistAnalysis): string[] {
  switch (analysis.recipe) {
    case 'analytics.activityTrend': {
      const { current, deltaPercent } = analysis.metrics;
      return [
        `🎙️ ${formatMinutes(current.voiceSeconds)} (${formatPercent(deltaPercent.voiceSeconds)})`,
        `💬 ${current.messageCount} (${formatPercent(deltaPercent.messageCount)})`,
      ];
    }
    case 'analytics.decliningChannels': {
      return analysis.metrics.channels
        .slice(0, MAX_BULLET_LINES)
        .map(
          (c) =>
            `• ${c.channelName ?? c.channelId}: ${formatMinutes(c.current.voiceSeconds)} (${formatPercent(c.deltaPercent)})`,
        );
    }
    case 'analytics.memberActivity': {
      const { targetDisplayName, level } = analysis.metrics;
      const lines = [`👤 ${targetDisplayName ?? analysis.metrics.targetUserId}`];
      if (level) lines.push(`⭐ Lv.${level.level} (${level.xp}xp)`);
      return lines;
    }
    case 'analytics.structureLint': {
      const { summary } = analysis.metrics;
      // F-088 — null 은 "측정 보류"(활동 관측 부족)라 0 으로 표시하지 않는다
      const activeText = summary.activeChannelCount ?? '—';
      return [
        `🏷️ ${summary.roleCount} roles · #️⃣ ${summary.channelCount} channels (${activeText} active)`,
        ...analysis.metrics.findings
          .slice(0, MAX_BULLET_LINES)
          .map((f) => `• ${f.rule}: ${f.count}`),
      ];
    }
    case 'analytics.newMemberCohort': {
      const { joinCount, youngAccountCount, noActivityCount } = analysis.metrics;
      return [
        `👋 ${joinCount}`,
        youngAccountCount !== null ? `🆕 ${youngAccountCount}` : null,
        noActivityCount !== null ? `😴 ${noActivityCount}` : null,
      ].filter((line): line is string => line !== null);
    }
    default:
      return [];
  }
}

/** 초 단위를 분 단위 표시로 변환(코드베이스에 공용 duration 포맷터 부재 — 로컬 최소 구현) */
const SECONDS_PER_MINUTE = 60;
function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / SECONDS_PER_MINUTE)}m`;
}

/** 직전 구간이 0이면 증감률이 정의되지 않아 null 이다(∞·NaN 을 표시하지 않는다) */
function formatPercent(percent: number | null): string {
  if (percent === null) return 'N/A';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${Math.round(percent)}%`;
}

function buildDashboardUrl(context: AdminAssistEmbedContext): string {
  return `${context.webUrl}/dashboard/guild/${context.guildId}/overview`;
}

/**
 * 공통 하단(전 분기 공통) — 후속 질문(일반 텍스트, 버튼·칩 없음, D7 (a)) + 개요 페이지
 * 딥링크(+ 분기별 설정 딥링크·C-lite 가이드 링크가 있으면 함께 — extraLinkLines, 완성된 줄).
 *
 * @returns 후속질문 필드를 추가했다면 그 인덱스 — `enforceEmbedTotalLength`가 총량 초과 시
 * 우선 축소 대상을 찾을 때 쓴다(링크 필드는 필수라 대상에서 제외).
 */
function addFooter(
  embed: EmbedBuilder,
  followUpQueries: string[],
  extraLinkLines: string[],
  context: AdminAssistEmbedContext,
): number | undefined {
  let followUpFieldIndex: number | undefined;
  if (followUpQueries.length > 0) {
    const lines = followUpQueries.slice(0, MAX_BULLET_LINES).map((q) => `• ${q}`);
    embed.addFields({
      name: context.i18n.t(context.locale, 'commands.adminAssistFollowUpsLabel'),
      value: truncateField(lines.join('\n')),
    });
    followUpFieldIndex = (embed.data.fields?.length ?? 1) - 1;
  }

  const linkLines = [
    context.i18n.t(context.locale, 'commands.adminAssistDashboardLink', {
      url: buildDashboardUrl(context),
    }),
  ];
  linkLines.push(...extraLinkLines);
  embed.addFields({ name: '🔗', value: linkLines.join('\n') });

  return followUpFieldIndex;
}

/**
 * Embed 총량(6000자, `EMBED_TOTAL_MAX_LENGTH`)을 넘으면 보정한다. 보정 순서:
 * (a) 후속질문 필드를 줄 단위로 줄인다(0줄이면 필드 자체를 제거) → (b) 그래도 넘으면
 * description 을 추가 절단하고 절단 힌트 필드를 유지·신설한다. 링크·게시 힌트 필드 등
 * 나머지 필드는 끝까지 건드리지 않는다(필수 정보 보존).
 */
function enforceEmbedTotalLength(
  embed: EmbedBuilder,
  followUpFieldIndex: number | undefined,
  context: AdminAssistEmbedContext,
): void {
  if (embedLength(embed.data) <= EMBED_TOTAL_MAX_LENGTH) return;

  if (followUpFieldIndex !== undefined) {
    shrinkFollowUpField(embed, followUpFieldIndex);
  }
  if (embedLength(embed.data) <= EMBED_TOTAL_MAX_LENGTH) return;

  shrinkDescriptionForTotalLength(embed, context);
}

/** 후속질문 필드를 줄 단위로 줄여가며 재검사한다 — 0줄까지 줄여도 넘으면 필드를 제거한다 */
function shrinkFollowUpField(embed: EmbedBuilder, fieldIndex: number): void {
  const field = embed.data.fields?.[fieldIndex];
  if (!field) return;

  const lines = field.value.split('\n');
  for (let keep = lines.length - 1; keep >= 0; keep -= 1) {
    if (keep === 0) {
      embed.spliceFields(fieldIndex, 1);
      return;
    }
    embed.spliceFields(fieldIndex, 1, {
      name: field.name,
      value: lines.slice(0, keep).join('\n'),
    });
    if (embedLength(embed.data) <= EMBED_TOTAL_MAX_LENGTH) return;
  }
}

/**
 * description 을 총량 초과분(overflow, UTF-16 코드유닛 기준)만큼 추가 절단한다. 절단 힌트
 * 필드가 이미 있으면 재사용(중복 방지)하고, 없으면 새로 추가하며 그 비용도 절단량에 포함한다.
 */
function shrinkDescriptionForTotalLength(
  embed: EmbedBuilder,
  context: AdminAssistEmbedContext,
): void {
  const description = embed.data.description;
  if (!description) return; // 방어적 — description 없이 6000자를 넘는 조합은 계약상 도달하지 않는다

  const hasHintField =
    embed.data.fields?.some((f) => f.name === TRUNCATION_HINT_FIELD_NAME) ?? false;
  const hintText = context.i18n.t(context.locale, 'commands.adminAssistTruncatedHint');
  const hintFieldCost = hasHintField ? 0 : TRUNCATION_HINT_FIELD_NAME.length + hintText.length;

  const overflow = embedLength(embed.data) + hintFieldCost - EMBED_TOTAL_MAX_LENGTH;
  embed.setDescription(truncateDescriptionByOverflow(description, overflow));

  if (!hasHintField) {
    embed.addFields({ name: TRUNCATION_HINT_FIELD_NAME, value: hintText });
  }
}

/**
 * description 의 UTF-16 총량을 overflowUnits 만큼 줄인다. 초기 추정치를 코드포인트 단위로
 * 절단(`truncateByCodePoint` — T7, lone surrogate 방지)한 뒤, 서로게이트 페어(이모지 등)로
 * 인한 오차를 코드포인트 단위 재시도로 보정한다(과소삭제만 방지하면 되므로 과다삭제 방향은
 * 안전측이라 반복을 그 방향으로만 정지시킨다).
 */
function truncateDescriptionByOverflow(description: string, overflowUnits: number): string {
  const safeOverflow = Math.max(overflowUnits, 0);
  const targetLength = description.length - safeOverflow;
  const codePointCount = Array.from(description).length;

  let keep = Math.max(codePointCount - safeOverflow - ELLIPSIS_LEN, 0);
  let candidate = `${truncateByCodePoint(description, keep)}${ELLIPSIS}`;
  while (candidate.length > targetLength && keep > 0) {
    keep -= 1;
    candidate = `${truncateByCodePoint(description, keep)}${ELLIPSIS}`;
  }
  return candidate;
}
