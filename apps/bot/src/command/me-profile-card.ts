import type {
  BotApiClientService,
  GetMeProfileOptions,
  MeProfileResponse,
} from '@onyu/bot-api-client';
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import type { BotI18nService } from '../common/application/bot-i18n.service';

/**
 * `/me`(`/미`) 프로필 카드의 조회(fetchMeProfileCard) + 응답 조립(buildProfileCardReply) +
 * 버튼 행 빌더(buildProfileButtonRow)를 `MeCommand`·`RankCommand`(본인 경로) 공용 순수
 * 함수로 제공한다(F-VOICE-123 / F-LVL-25 U9-b, plan me-card-alias.md D4).
 *
 * `ok:false`(렌더 실패) 판정은 의도적으로 여기에 두지 않는다 — `MeCommand`는 기존에
 * `result.ok`를 검사하지 않는 동작을 그대로 유지해야 하므로(plan D3 🔒 주석), ok 가드는
 * 이 함수를 호출하는 쪽(`RankCommand` 본인 경로)에서만 추가한다.
 */

// 대시보드 기본 URL (WEB_URL 미설정 시 prod 도메인) — me.command.ts에서 이관
const DEFAULT_WEB_URL = 'https://onyu.dev';

// 버튼 customId — bot-me-interaction.handler.ts와 공유(F-VOICE-064/065)
const CUSTOM_ID_ACTIVITY_DETAIL = 'me:activity_detail';
const CUSTOM_ID_LEADERBOARD = 'me:leaderboard';

/** 카드 조회 — `apiClient.getMeProfile()`의 얇은 래퍼(조회/응답조립 분리, ESLint 함수 길이 warn 회피) */
export async function fetchMeProfileCard(
  apiClient: BotApiClientService,
  options: GetMeProfileOptions,
): Promise<MeProfileResponse> {
  return apiClient.getMeProfile(options);
}

interface BuildProfileButtonRowParams {
  i18n: BotI18nService;
  locale: string;
  guildId: string;
  hasData: boolean;
}

/**
 * 대시보드 링크(Link) 버튼 + (활동 데이터가 있을 때만) 서버 리더보드·활동 상세 버튼(F-VOICE-064/065).
 * 활동 없음(`hasData=false`) 시엔 조회할 데이터가 없으므로 Link 버튼만 표시(현행 유지).
 */
export function buildProfileButtonRow(
  params: BuildProfileButtonRowParams,
): ActionRowBuilder<ButtonBuilder> {
  const { i18n, locale, guildId, hasData } = params;

  // WEB_URL은 런타임에 읽는다 — 모듈 import 시점에 평가하면 ConfigModule의 .env 로드 전이라 fallback이 굳을 수 있다
  const webUrl = process.env['WEB_URL'] ?? DEFAULT_WEB_URL;
  const linkButton = new ButtonBuilder()
    .setLabel(i18n.t(locale, 'commands.meButtonLabel'))
    .setStyle(ButtonStyle.Link)
    // 뱃지·레벨(성장) 맥락 카드이므로 /my/growth로 연결한다 — 구 경로 /my/voice는
    // next.config.mjs 리다이렉트로 /my/activity(음성 통계 탭)에 떨어져 뱃지 상세와 무관해진다.
    .setURL(`${webUrl}/my/growth?guildId=${guildId}`);

  if (!hasData) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);
  }

  const leaderboardButton = new ButtonBuilder()
    .setCustomId(CUSTOM_ID_LEADERBOARD)
    .setLabel(i18n.t(locale, 'commands.meButtonLeaderboard'))
    .setStyle(ButtonStyle.Secondary);

  const activityDetailButton = new ButtonBuilder()
    .setCustomId(CUSTOM_ID_ACTIVITY_DETAIL)
    .setLabel(i18n.t(locale, 'commands.meButtonActivityDetail'))
    .setStyle(ButtonStyle.Primary);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    linkButton,
    leaderboardButton,
    activityDetailButton,
  );
}

/** `interaction.editReply()`에 그대로 전달 가능한 응답 페이로드 */
export interface ProfileCardReplyPayload {
  content?: string;
  files?: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

interface BuildProfileCardReplyParams {
  i18n: BotI18nService;
  locale: string;
  guildId: string;
  result: MeProfileResponse;
  /** 활동 없음(`data:null`) 시 사용할 i18n 키 — 커맨드별 문맥 문구 주입(D3) */
  noActivityKey: string;
  /** PNG 첨부 파일명(`/me`는 `profile.png`, `/rank` 본인 경로도 동일 카드이므로 `profile.png`) */
  attachmentName: string;
}

/**
 * 조회 결과(`MeProfileResponse`)를 카드 응답(PNG 첨부 또는 활동없음 안내)으로 조립한다.
 * `ok` 판정은 호출부 책임(위 모듈 주석 참고).
 */
export function buildProfileCardReply(
  params: BuildProfileCardReplyParams,
): ProfileCardReplyPayload {
  const { i18n, locale, guildId, result, noActivityKey, attachmentName } = params;
  const buttonRow = buildProfileButtonRow({ i18n, locale, guildId, hasData: Boolean(result.data) });

  if (!result.data) {
    return {
      content: i18n.t(locale, noActivityKey, { days: result.days }),
      components: [buttonRow],
    };
  }

  const imageBuffer = Buffer.from(result.data.imageBase64, 'base64');
  const attachment = new AttachmentBuilder(imageBuffer, { name: attachmentName });
  return { files: [attachment], components: [buttonRow] };
}
