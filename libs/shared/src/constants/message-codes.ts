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
  // 비활동 회원 설정 저장 시 역할 검증(감사 2026-10-22 A2·A3)
  INACTIVE_ROLE_SAME_AS_REMOVE: 'INACTIVE_ROLE_SAME_AS_REMOVE',
  INACTIVE_ROLE_HIERARCHY: 'INACTIVE_ROLE_HIERARCHY',
  INACTIVE_ROLE_INVALID: 'INACTIVE_ROLE_INVALID',
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
  /** 저장 요청 채널이 이 길드 소속이 아니거나 삭제됨. params: { channelId } */
  ERR_CHANNEL_NOT_IN_GUILD: 'ERR_CHANNEL_NOT_IN_GUILD',
  /** Discord 장애·지연으로 채널 소속을 확인하지 못해 저장 거부(503). params: { channelId } */
  ERR_CHANNEL_OWNERSHIP_UNVERIFIABLE: 'ERR_CHANNEL_OWNERSHIP_UNVERIFIABLE',

  // ── me-* 쿼리 파라미터 검증 400 (i18n G1-ⓑ 1차) ──
  /** guildId 쿼리 누락. params 없음 */
  GUILD_ID_REQUIRED: 'GUILD_ID_REQUIRED',
  /** days 가 라우트별 화이트리스트 밖. params: { allowedDays } — 컨트롤러마다 허용값이 달라 문구에 보간한다 */
  INVALID_DAYS_PARAM: 'INVALID_DAYS_PARAM',
  /** co-presence 페어 상세에서 peerId 가 본인(JWT.sub). params 없음 */
  SELF_PEER_NOT_ALLOWED: 'SELF_PEER_NOT_ALLOWED',
  /** 듀오 케미 카드 상대가 관계 표시를 거부(F-COPRESENCE-035). 400 — 봇이 code 로 안내 분기, params 없음 */
  CO_PRESENCE_PEER_HIDDEN: 'CO_PRESENCE_PEER_HIDDEN',
  /** 결산 노출 창 밖 요청(404). params: { phase } — 'not_started' | 'ended' */
  RECAP_OUT_OF_WINDOW: 'RECAP_OUT_OF_WINDOW',
  /** 결산 year 쿼리가 지원 연도가 아님(400). params 없음 */
  INVALID_RECAP_YEAR: 'INVALID_RECAP_YEAR',

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
  /** newbie 완료 보상 역할 계층 검증 거부(403/400) 또는 역할 조회 실패(503). errors.missionCompleteRoleId 동반. params 없음 */
  NEWBIE_COMPLETE_ROLE_REJECTED: 'NEWBIE_COMPLETE_ROLE_REJECTED',

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

  // ── 길드 멤버십 가드 (JwtGuildMembershipGuard, i18n 잔여 감사 §7-10 권한 403 코드화) ──
  /** JWT managedGuilds 목록에 없는 guildId 접근(403). params 없음 */
  GUILD_ACCESS_DENIED: 'GUILD_ACCESS_DENIED',

  // ── 관리 조치 안전장치 (docs/plans/admin-action-guard-fixes.md W2, F-AUTH-006) ──
  /** 킥 조치(ACTION_KICK/kick:true) 요청자가 KICK_MEMBERS 비트를 보유하지 않음(403). params 없음 */
  GUILD_KICK_PERMISSION_REQUIRED: 'GUILD_KICK_PERMISSION_REQUIRED',

  // ── 관리 조치 되돌리기 (docs/plans/admin-action-history-undo.md A4, F-INACTIVE-012) ──
  /** 되돌리기 대상 로그가 존재하지 않거나 타 길드 소유(404). params 없음 */
  ACTION_LOG_NOT_FOUND: 'ACTION_LOG_NOT_FOUND',
  /** 되돌리기 대상 actionType이 ACTION_DM/ACTION_KICK(되돌릴 수 없음, 400). params 없음 */
  UNDO_NOT_SUPPORTED_ACTION_TYPE: 'UNDO_NOT_SUPPORTED_ACTION_TYPE',
  /** 원본 로그에 roleId 스냅샷이 없음(레거시 로그, 400). params 없음 */
  UNDO_MISSING_ROLE_SNAPSHOT: 'UNDO_MISSING_ROLE_SNAPSHOT',
  /** 되돌리기 결과 로그 자체를 다시 되돌리려는 시도(연쇄 차단, 400). params 없음 */
  UNDO_OF_UNDO_NOT_ALLOWED: 'UNDO_OF_UNDO_NOT_ALLOWED',

  // ── 관리 로그 채널 (docs/plans/guild-admin-log-channel.md, F-ADMIN-LOG-009) ──
  /**
   * 관리 로그 채널 저장 시점 채널 접근성 preflight 거부(400, ERR_WEEKLY_REPORT_CHANNEL_UNREACHABLE
   * 과 동형이나 도메인 접두사가 달라 재사용 불가). params: { channelId }
   */
  ERR_ADMIN_LOG_CHANNEL_UNREACHABLE: 'ERR_ADMIN_LOG_CHANNEL_UNREACHABLE',

  // ── 설정 자동 조치 기록 [다시 켜기] (docs/plans/settings-auto-action-log.md, F-WEB-043 SA2) ──
  /** 기록이 없거나 id 형식 불일치 / 다른 길드 소유(404). params 없음 */
  ERR_SETTINGS_AUTO_ACTION_NOT_FOUND: 'ERR_SETTINGS_AUTO_ACTION_NOT_FOUND',
  /** 복원 불가 기록(400). params: { reason: 'not_auto_disabled' | 'no_channel' | 'unsupported_target' | 'previous_value_invalid' } */
  ERR_SETTINGS_AUTO_ACTION_NOT_RESTORABLE: 'ERR_SETTINGS_AUTO_ACTION_NOT_RESTORABLE',
  /** 캐시 무시 재확인 결과 채널이 여전히 접근 불가(409). params 없음 */
  ERR_SETTINGS_AUTO_ACTION_STILL_UNREACHABLE: 'ERR_SETTINGS_AUTO_ACTION_STILL_UNREACHABLE',
  /** 조건부 복원 UPDATE affected 0 — 그 사이 설정이 바뀜(409). params 없음 */
  ERR_SETTINGS_AUTO_ACTION_STATE_CHANGED: 'ERR_SETTINGS_AUTO_ACTION_STATE_CHANGED',
  /** 재확인 결과 unknown — 켜지 않음(503). params 없음 */
  ERR_SETTINGS_AUTO_ACTION_CHECK_UNAVAILABLE: 'ERR_SETTINGS_AUTO_ACTION_CHECK_UNAVAILABLE',

  // ── auto-channel 방제 자유 입력 (docs/plans/auto-channel-name-input.md §3-4, F-VOICE-125~133) ──
  /** required 모드 + trim 후 빈 입력(400/봇 error 분기). params 없음 */
  ERR_AUTO_CHANNEL_NAME_REQUIRED: 'ERR_AUTO_CHANNEL_NAME_REQUIRED',
  /** 입력 길이가 minLength 미만(빈 입력 제외). params: { minLength } */
  ERR_AUTO_CHANNEL_NAME_TOO_SHORT: 'ERR_AUTO_CHANNEL_NAME_TOO_SHORT',
  /** 입력 길이가 maxLength 초과. params: { maxLength } */
  ERR_AUTO_CHANNEL_NAME_TOO_LONG: 'ERR_AUTO_CHANNEL_NAME_TOO_LONG',
  /** 입력에 금칙어 부분 포함(대소문자 무시). params: { word } */
  ERR_AUTO_CHANNEL_NAME_FORBIDDEN_WORD: 'ERR_AUTO_CHANNEL_NAME_FORBIDDEN_WORD',
  /** 저장 시점 R1·R6 — 버튼 channelNameTemplate 에 {input} 이 정확히 1회가 아님(0회/2회 이상). params 없음 */
  ERR_AUTO_CHANNEL_TEMPLATE_MISSING_INPUT: 'ERR_AUTO_CHANNEL_TEMPLATE_MISSING_INPUT',
  /** 저장 시점 R2·R6 — 하위 선택지 channelNameTemplate 에 {input} 이 정확히 1회가 아님. params 없음 */
  ERR_AUTO_CHANNEL_SUB_TEMPLATE_MISSING_INPUT: 'ERR_AUTO_CHANNEL_SUB_TEMPLATE_MISSING_INPUT',
  /** 저장 시점 R3 — instantNameTemplate 에 {input} 포함(즉시 생성 모드는 입력 토큰 금지). params 없음 */
  ERR_AUTO_CHANNEL_INSTANT_INPUT_NOT_ALLOWED: 'ERR_AUTO_CHANNEL_INSTANT_INPUT_NOT_ALLOWED',
  /** 저장 시점 R4·R5 — minLength/maxLength 모순(min>max) 또는 계산된 상한보다 큼. params 없음 */
  ERR_AUTO_CHANNEL_NAME_RULE_INVALID: 'ERR_AUTO_CHANNEL_NAME_RULE_INVALID',
  /** N3 조회 시 대상 버튼/선택지의 nameInputMode='off' 이거나 최종 템플릿에 {input} 0회(404). params 없음 */
  ERR_AUTO_CHANNEL_NAME_INPUT_DISABLED: 'ERR_AUTO_CHANNEL_NAME_INPUT_DISABLED',

  // ── 관리 어시스턴트 Phase 3 승인-실행 E9 (docs/plans/admin-assist-phase3-approval.md D-16) ──
  /** 이력 행 없음 / 타 길드·타인 소유 / F5 동시 삭제(404). params 없음 */
  ERR_ADMIN_ASSIST_HISTORY_NOT_FOUND: 'ERR_ADMIN_ASSIST_HISTORY_NOT_FOUND',
  /** previewDigest 불일치 — 그 사이 값이 바뀜(409). details: { proposal } */
  ERR_ADMIN_ASSIST_PREVIEW_STALE: 'ERR_ADMIN_ASSIST_PREVIEW_STALE',
  /** 이미 적용됨(409, 멱등). details: { result } */
  ERR_ADMIN_ASSIST_ALREADY_EXECUTED: 'ERR_ADMIN_ASSIST_ALREADY_EXECUTED',
  /** 다른 요청이 실행 중(409). params 없음 */
  ERR_ADMIN_ASSIST_EXECUTION_IN_PROGRESS: 'ERR_ADMIN_ASSIST_EXECUTION_IN_PROGRESS',
  /** proposal TTL 초과(410). params 없음 */
  ERR_ADMIN_ASSIST_PROPOSAL_EXPIRED: 'ERR_ADMIN_ASSIST_PROPOSAL_EXPIRED',
  /** 실행 불가 행/액션(422). params: { reason: AdminAssistExecuteNotExecutableReason } */
  ERR_ADMIN_ASSIST_NOT_EXECUTABLE: 'ERR_ADMIN_ASSIST_NOT_EXECUTABLE',
  /** 킬 스위치 off(422). params 없음 */
  ERR_ADMIN_ASSIST_EXECUTION_DISABLED: 'ERR_ADMIN_ASSIST_EXECUTION_DISABLED',
  /** 도메인 저장 경로가 4xx 로 거절(422). params: { domainStatus, domainCode?: AdminAssistExecuteDomainCode } */
  ERR_ADMIN_ASSIST_DOMAIN_REJECTED: 'ERR_ADMIN_ASSIST_DOMAIN_REJECTED',
  /** 저장/조회 중 예외·도메인 5xx(503). params: { stage?, outcome?, domainCode? } */
  ERR_ADMIN_ASSIST_EXECUTION_FAILED: 'ERR_ADMIN_ASSIST_EXECUTION_FAILED',

  // ── report-intake 신고·권리침해 웹 접수 (공개 3종은 전역 네임스페이스 충돌 회피용 REPORT_INTAKE_ 접두) ──
  /** 폼 토큰 누락·위조·형식 오류·만료(400). params 없음 */
  REPORT_INTAKE_TOKEN_INVALID: 'REPORT_INTAKE_TOKEN_INVALID',
  /** 작성 시작 후 최소 시간 미달(400). params 없음 */
  REPORT_INTAKE_TOO_FAST: 'REPORT_INTAKE_TOO_FAST',
  /** IP 시간/일 접수 한도 초과(429). params: { retryAfterSeconds } */
  REPORT_INTAKE_RATE_LIMITED: 'REPORT_INTAKE_RATE_LIMITED',
  /** 신고 접수 행 없음(404). params 없음 */
  REPORT_NOT_FOUND: 'REPORT_NOT_FOUND',
  /** 전이표에 없는 상태 전이(409). params 없음 */
  REPORT_INVALID_TRANSITION: 'REPORT_INVALID_TRANSITION',
  /** 화면이 본 상태와 저장 상태 불일치(409). params 없음 */
  REPORT_STATUS_CONFLICT: 'REPORT_STATUS_CONFLICT',
  /** 종결 전이인데 처리 결과 코드 누락(400). params 없음 */
  REPORT_RESOLUTION_REQUIRED: 'REPORT_RESOLUTION_REQUIRED',
  /** 익명화된 행에 대한 재오픈·메모·보존 설정 등(409). params 없음 */
  REPORT_ALREADY_ANONYMIZED: 'REPORT_ALREADY_ANONYMIZED',
  /** legalHold 중인 행의 익명화 시도(409). params 없음 */
  REPORT_LEGAL_HOLD_ACTIVE: 'REPORT_LEGAL_HOLD_ACTIVE',
  /** 이미 운영진 채널에 통지됨(409). params 없음 */
  REPORT_ALREADY_NOTIFIED: 'REPORT_ALREADY_NOTIFIED',
  /** 운영진 통지 채널 env 미설정(409). params 없음 */
  REPORT_NOTIFY_CHANNEL_NOT_CONFIGURED: 'REPORT_NOTIFY_CHANNEL_NOT_CONFIGURED',
  /** 즉시 익명화 확인용 접수 번호 불일치(400). params 없음 */
  REPORT_CONFIRM_MISMATCH: 'REPORT_CONFIRM_MISMATCH',
  // ── 멤버 XP 수동 조정 (docs/plans/level-member-xp-adjust.md, F-LVL-34) ──
  /** 조정 대상이 봇 계정(400). params 없음 */
  LEVEL_XP_ADJUST_TARGET_BOT: 'LEVEL_XP_ADJUST_TARGET_BOT',
  /** 조정 대상이 탈퇴 멤버이거나 guild_member·user_level 모두 없음(404). params 없음 */
  LEVEL_XP_ADJUST_TARGET_NOT_FOUND: 'LEVEL_XP_ADJUST_TARGET_NOT_FOUND',
} as const;
export type MessageCode = (typeof MESSAGE_CODE)[keyof typeof MESSAGE_CODE];
