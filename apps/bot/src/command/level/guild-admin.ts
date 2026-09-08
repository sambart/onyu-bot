import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

/**
 * 리더보드 가시성 판정 근거 권한 조합(U10, F-LVL-27). `Administrator`만으로도 owner를
 * 포함하지만(Discord가 owner에게 항상 `ADMINISTRATOR`를 부여해 반환한다), 서버 관리
 * 권한만 위임받은 운영진도 관리자로 인정하기 위해 `ManageGuild`를 함께 확인한다.
 */
const GUILD_ADMIN_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
];

/**
 * 요청자(커맨드 실행자/버튼 클릭자)가 길드 관리자인지 판정한다(U10 — `/랭킹`·`/rank`·
 * `/me` 리더보드 버튼 3표면 공통). bot-api로 전송하는 `requesterIsGuildAdmin`의 유일한
 * 판정 근거이며, 서버가 이 값으로 `leaderboardVisibility='ADMIN_ONLY'` 거부 여부를
 * 최종 결정한다(봇은 표시만 한다). `memberPermissions`가 없으면(방어적 상황) 관리자가
 * 아닌 것으로 간주한다(fail-closed, D5).
 */
export function isGuildAdmin(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): boolean {
  return interaction.memberPermissions?.any(GUILD_ADMIN_PERMISSIONS) ?? false;
}
