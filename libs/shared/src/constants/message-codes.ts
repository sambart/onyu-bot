/**
 * API → 프론트(bot·web) 메시지 코드 계약 (R4).
 * 값 == 키 문자열(직렬화 가독성·로그 추적). 프론트는 code→자기 로케일 키 매핑(H-3).
 * 하위호환: 미지원 code 는 프론트가 message 폴백(H-3.3).
 */
export const MESSAGE_CODE = {
  // ── auto-channel 결과 (정상/에러 봉투, H-1.2) — 결과 봉투 코드는 Plan B 명명 채택(Phase 3.4) ──
  AUTO_CHANNEL_CREATED: 'AUTO_CHANNEL_CREATED',
  AUTO_CHANNEL_CHOOSE_OPTION: 'AUTO_CHANNEL_CHOOSE_OPTION',
  ERR_AUTO_CHANNEL_NOT_IN_VOICE: 'ERR_AUTO_CHANNEL_NOT_IN_VOICE',
  ERR_AUTO_CHANNEL_CONFIG_NOT_FOUND: 'ERR_AUTO_CHANNEL_CONFIG_NOT_FOUND',
  ERR_AUTO_CHANNEL_INVALID_CHANNEL: 'ERR_AUTO_CHANNEL_INVALID_CHANNEL',
  ERR_AUTO_CHANNEL_MOVE_FAILED: 'ERR_AUTO_CHANNEL_MOVE_FAILED',
  /** 트리거 채널이 다른 configId에 이미 점유됨(409, F-VOICE-088). params 없음 */
  ERR_AUTO_CHANNEL_TRIGGER_CONFLICT: 'ERR_AUTO_CHANNEL_TRIGGER_CONFLICT',

  // ── status-prefix 결과 (H-1.2) — Plan B 명명 채택(Phase 3.4) ──
  STATUS_PREFIX_APPLIED: 'STATUS_PREFIX_APPLIED',
  STATUS_PREFIX_RESET_DONE: 'STATUS_PREFIX_RESET_DONE',
  STATUS_PREFIX_RESET_NO_CHANGE: 'STATUS_PREFIX_RESET_NO_CHANGE', // 정상 안내(에러 아님 — "변경된 닉네임이 없습니다")
  ERR_STATUS_PREFIX_BUTTON_NOT_FOUND: 'ERR_STATUS_PREFIX_BUTTON_NOT_FOUND',
  ERR_STATUS_PREFIX_INVALID_CONFIG: 'ERR_STATUS_PREFIX_INVALID_CONFIG',
  ERR_STATUS_PREFIX_SERVER_CONFIG_NOT_FOUND: 'ERR_STATUS_PREFIX_SERVER_CONFIG_NOT_FOUND',
  ERR_STATUS_PREFIX_APPLY_FAILED: 'ERR_STATUS_PREFIX_APPLY_FAILED',
  ERR_STATUS_PREFIX_RESET_FAILED: 'ERR_STATUS_PREFIX_RESET_FAILED',
  ERR_STATUS_PREFIX_DISABLED: 'ERR_STATUS_PREFIX_DISABLED',
  ERR_STATUS_PREFIX_NICKNAME_TOO_LONG: 'ERR_STATUS_PREFIX_NICKNAME_TOO_LONG',

  // ── 기존 DomainException code 카탈로그 (wire 값 보존 — 값 변경 금지, §4.3) ──
  EXCLUDED_CHANNEL_DUPLICATE: 'EXCLUDED_CHANNEL_DUPLICATE',
  GUILD_NOT_FOUND: 'GUILD_NOT_FOUND',
  INACTIVE_ROLE_NOT_CONFIGURED: 'INACTIVE_ROLE_NOT_CONFIGURED',
  REMOVE_ROLE_NOT_CONFIGURED: 'REMOVE_ROLE_NOT_CONFIGURED',
  MISSION_NOT_IN_PROGRESS: 'MISSION_NOT_IN_PROGRESS',
  PREFIX_DUPLICATE: 'PREFIX_DUPLICATE',
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  STICKY_PIN_CHANNEL_LIMIT_EXCEEDED: 'STICKY_PIN_CHANNEL_LIMIT_EXCEEDED',

  // ── Discord 권한 실패 (permission-error-guidance, 5개 도메인 공유) ──
  /** 50001 Missing Access — 봇이 채널을 볼 수 없음. params: { channelId } */
  ERR_DISCORD_MISSING_ACCESS: 'ERR_DISCORD_MISSING_ACCESS',
  /** 50013 Missing Permissions — 채널은 보이나 필요 권한 없음. params: { channelId } */
  ERR_DISCORD_MISSING_PERMISSIONS: 'ERR_DISCORD_MISSING_PERMISSIONS',

  // ── me-* 쿼리 파라미터 검증 400 (i18n G1-ⓑ 1차) ──
  /** guildId 쿼리 누락. params 없음 */
  GUILD_ID_REQUIRED: 'GUILD_ID_REQUIRED',
  /** days 가 라우트별 화이트리스트 밖. params: { allowedDays } — 컨트롤러마다 허용값이 달라 문구에 보간한다 */
  INVALID_DAYS_PARAM: 'INVALID_DAYS_PARAM',
  /** co-presence 페어 상세에서 peerId 가 본인(JWT.sub). params 없음 */
  SELF_PEER_NOT_ALLOWED: 'SELF_PEER_NOT_ALLOWED',

  // ── class-validator DTO 검증 400 (i18n G1-ⓑ 2차) ──
  /** 검증 실패 일반 코드(실패 2건 이상 또는 문구군 미배정). params: { fields } — 실패 필드 경로 목록 */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** YYYYMMDD 형식 위반. params: { field } */
  INVALID_DATE_FORMAT: 'INVALID_DATE_FORMAT',
  /** from>to 또는 조회 기간 상한 초과. params: { maxDays } */
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  /** auto-channel instant 모드에서 카테고리 미지정. params 없음 */
  INSTANT_CATEGORY_REQUIRED: 'INSTANT_CATEGORY_REQUIRED',
  /** status-prefix 템플릿에 필수 플레이스홀더 누락. params 없음 */
  PREFIX_TEMPLATE_PLACEHOLDER_REQUIRED: 'PREFIX_TEMPLATE_PLACEHOLDER_REQUIRED',

  // ── 웹 노출 API 예외 (i18n G1-ⓑ 3차) ──
  /** role-panel 게시 시 채널 미선택(400). params 없음 */
  ROLE_PANEL_CHANNEL_REQUIRED: 'ROLE_PANEL_CHANNEL_REQUIRED',
  /**
   * Discord 메시지 전송 실패 — 권한 무관(10003·429·5xx·네트워크). 503.
   * params: { channelId, reason } — reason 은 Discord 원문 사유. 권한 실패와 달리
   * 배너가 뜨지 않아 인라인 문구가 유일한 안내이므로 로케일 문구가 reason 을 보간한다.
   */
  DISCORD_MESSAGE_SEND_FAILED: 'DISCORD_MESSAGE_SEND_FAILED',
  /** Discord 메시지 수정 실패 — 권한 무관(10008 폴백 제외). 503. params: { channelId, reason } */
  DISCORD_MESSAGE_EDIT_FAILED: 'DISCORD_MESSAGE_EDIT_FAILED',
  /** 봇 identity 미초기화로 쓰기 요청 거부(503). role-panel·level 공유. params 없음 */
  BOT_IDENTITY_NOT_READY: 'BOT_IDENTITY_NOT_READY',
  /** 미션 조회 실패(404) — 미존재 또는 guild 불일치. params 없음 */
  MISSION_NOT_FOUND: 'MISSION_NOT_FOUND',
  /** 템플릿에 허용되지 않은 변수 포함(400). 필드별 상세는 errors 맵. params 없음 */
  TEMPLATE_VARIABLE_NOT_ALLOWED: 'TEMPLATE_VARIABLE_NOT_ALLOWED',

  // ── i18n P3 — throwPeriodValidationError 코드화 (moco 기간 쿼리 검증 400) ──
  /**
   * moco 기간 조회에서 periodStart/periodEnd 중 하나만 지정됨(400). params 없음.
   * INVALID_FORMAT/INVALID_RANGE/RANGE_TOO_LONG 은 기존 INVALID_DATE_FORMAT/INVALID_DATE_RANGE 를 재사용한다.
   */
  PERIOD_RANGE_REQUIRED: 'PERIOD_RANGE_REQUIRED',

  // ── weekly-report 저장 preflight (F-GEMINI-031) ──
  /** 저장 시점 채널 접근성 preflight 거부(404 Unknown Channel 또는 403 Missing Access). params: { channelId } */
  ERR_WEEKLY_REPORT_CHANNEL_UNREACHABLE: 'ERR_WEEKLY_REPORT_CHANNEL_UNREACHABLE',
  /** timezone 값이 IANA 표준으로 인식되지 않음(400, F-GEMINI-032 ①). params 없음 — §D3 */
  ERR_WEEKLY_REPORT_INVALID_TIMEZONE: 'ERR_WEEKLY_REPORT_INVALID_TIMEZONE',

  // ── 길드 멤버십 가드 (GuildMembershipGuard, i18n 잔여 감사 §7-10 권한 403 코드화) ──
  /** JWT managedGuilds 목록에 없는 guildId 접근(403). params 없음 */
  GUILD_ACCESS_DENIED: 'GUILD_ACCESS_DENIED',
} as const;
export type MessageCode = (typeof MESSAGE_CODE)[keyof typeof MESSAGE_CODE];
