/**
 * buildPageButtonRow() 순수 함수 단위 테스트(S7) — customId 포맷·경계 비활성화를 검증한다.
 * `leaderboard.command.ts`와 `bot-level-interaction.handler.ts`가 공유하는 유일한 조립
 * 함수이므로, 여기서 검증되면 두 소비처 모두 동일 동작이 보장된다(UC-07 TC-07-15).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ButtonBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { BotI18nService } from '../../common/application/bot-i18n.service';
import { buildPageButtonRow, RANK_BUTTON_CUSTOM_ID_PREFIX } from './leaderboard-buttons';

function makeI18n(): BotI18nService {
  const i18n = new BotI18nService();
  i18n.onModuleInit();
  return i18n;
}

function toJson(row: ReturnType<typeof buildPageButtonRow>): Array<Record<string, unknown>> {
  return row.components.map((c: ButtonBuilder) => c.toJSON() as unknown as Record<string, unknown>);
}

describe('buildPageButtonRow', () => {
  const i18n = makeI18n();

  it('customId를 rank:prev:{guildId}:{page} / rank:next:{guildId}:{page} 형식으로 조립한다', () => {
    const row = buildPageButtonRow({
      guildId: 'guild-1',
      page: 2,
      totalPages: 5,
      locale: 'ko',
      i18n,
    });

    const [prev, next] = toJson(row);
    expect(prev.custom_id).toBe(`${RANK_BUTTON_CUSTOM_ID_PREFIX.PREV}guild-1:2`);
    expect(next.custom_id).toBe(`${RANK_BUTTON_CUSTOM_ID_PREFIX.NEXT}guild-1:2`);
  });

  it('첫 페이지(page<=1)이면 이전 버튼만 비활성화한다', () => {
    const row = buildPageButtonRow({
      guildId: 'guild-1',
      page: 1,
      totalPages: 5,
      locale: 'ko',
      i18n,
    });

    const [prev, next] = toJson(row);
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it('마지막 페이지(page>=totalPages)이면 다음 버튼만 비활성화한다', () => {
    const row = buildPageButtonRow({
      guildId: 'guild-1',
      page: 5,
      totalPages: 5,
      locale: 'ko',
      i18n,
    });

    const [prev, next] = toJson(row);
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('totalPages가 1(페이지 1개뿐)이면 이전·다음 모두 비활성화한다', () => {
    const row = buildPageButtonRow({
      guildId: 'guild-1',
      page: 1,
      totalPages: 1,
      locale: 'ko',
      i18n,
    });

    const [prev, next] = toJson(row);
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it('로케일에 맞는 라벨(이전/다음, Previous/Next)을 사용한다', () => {
    const koRow = buildPageButtonRow({
      guildId: 'guild-1',
      page: 2,
      totalPages: 5,
      locale: 'ko',
      i18n,
    });
    const enRow = buildPageButtonRow({
      guildId: 'guild-1',
      page: 2,
      totalPages: 5,
      locale: 'en',
      i18n,
    });

    const [koPrev, koNext] = toJson(koRow);
    const [enPrev, enNext] = toJson(enRow);
    expect(koPrev.label).toBe('이전');
    expect(koNext.label).toBe('다음');
    expect(enPrev.label).toBe('Previous');
    expect(enNext.label).toBe('Next');
  });

  // ── 진입점 이원화 — 로직 이중 구현 없음 정적 확인(TC-07-15) ───────────────────
  describe('슬래시 커맨드 vs 버튼 클릭 — 이중 구현 없음(TC-07-15)', () => {
    it('leaderboard.command.ts와 bot-level-interaction.handler.ts 둘 다 buildPageButtonRow를 이 파일에서 import한다(customId 조립을 각자 재구현하지 않는다)', () => {
      const commandSource = readFileSync(join(__dirname, 'leaderboard.command.ts'), 'utf-8');
      const handlerSource = readFileSync(
        join(__dirname, '..', '..', 'event', 'level', 'bot-level-interaction.handler.ts'),
        'utf-8',
      );

      expect(commandSource).toMatch(
        /import\s*\{[^}]*buildPageButtonRow[^}]*\}\s*from\s*['"]\.\/leaderboard-buttons['"]/,
      );
      expect(handlerSource).toMatch(
        /import\s*\{[^}]*buildPageButtonRow[^}]*\}\s*from\s*['"].*command\/level\/leaderboard-buttons['"]/,
      );
    });

    it('customId 접두어(rank:prev:/rank:next:) 리터럴은 이 파일(leaderboard-buttons.ts)에만 정의돼 있다', () => {
      const buttonsSource = readFileSync(join(__dirname, 'leaderboard-buttons.ts'), 'utf-8');
      const commandSource = readFileSync(join(__dirname, 'leaderboard.command.ts'), 'utf-8');
      const handlerSource = readFileSync(
        join(__dirname, '..', '..', 'event', 'level', 'bot-level-interaction.handler.ts'),
        'utf-8',
      );

      expect(buttonsSource).toMatch(/rank:prev:/);
      // 소비처는 접두어 문자열 리터럴을 직접 정의하지 않고 RANK_BUTTON_CUSTOM_ID_PREFIX(import)만 참조한다
      expect(commandSource).not.toMatch(/['"]rank:(prev|next):/);
      expect(handlerSource).not.toMatch(/['"]rank:(prev|next):/);
    });
  });
});
