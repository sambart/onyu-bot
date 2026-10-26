/**
 * LocaleResolverService(봇) 단위 테스트 (F-GENERAL-005, 2026-08-01 신규).
 *
 * 커버 케이스:
 * - resolve 우선순위: ① 저장된 user locale(bot-api) → ② interaction.locale 매핑 → ③ 기본값(en)
 * - getUserLocale 실패(타임아웃/5xx/네트워크) → 예외를 던지지 않고 2순위로 폴백(EC-RP-51)
 * - bot-api가 { locale: null } 반환 → 값으로 오인하지 않고 2순위로 진행(EC-RP-52)
 * - 길드(서버) locale은 이 리졸버에 미포함(_guildId 미사용, F-GENERAL-004/005 불변 원칙)
 */
import type { BotApiClientService } from '@onyu/bot-api-client';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { LocaleResolverService } from './locale-resolver.service';

describe('LocaleResolverService (bot)', () => {
  let service: LocaleResolverService;
  let apiClient: { getUserLocale: Mock };

  beforeEach(() => {
    apiClient = { getUserLocale: vi.fn() };
    service = new LocaleResolverService(apiClient as unknown as BotApiClientService);
  });

  describe('resolve — 우선순위 체인', () => {
    it('1순위: 저장된 user locale이 있으면 그 값을 반환하고 interaction.locale은 무시한다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: 'ko' });

      const result = await service.resolve('user-1', 'guild-1', 'en-US');

      expect(result).toBe('ko');
      expect(apiClient.getUserLocale).toHaveBeenCalledWith('user-1');
    });

    it('저장된 locale이 null이면 값으로 오인하지 않고 2순위(interaction.locale)로 진행한다 (EC-RP-52)', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: null });

      const result = await service.resolve('user-1', 'guild-1', 'ko-KR');

      expect(result).toBe('ko');
    });

    it('저장/interaction.locale 모두 없으면 기본값 en을 반환한다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: null });

      const result = await service.resolve('user-1', 'guild-1');

      expect(result).toBe('en');
    });

    it('interaction.locale이 지원하지 않는 언어(ja)면 기본값 en으로 폴백한다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: null });

      const result = await service.resolve('user-1', 'guild-1', 'ja');

      expect(result).toBe('en');
    });

    it('ko-KR → ko로 매핑된다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: null });

      const result = await service.resolve('user-1', null, 'ko-KR');

      expect(result).toBe('ko');
    });

    it('en-US → en으로 매핑된다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: null });

      const result = await service.resolve('user-1', null, 'en-US');

      expect(result).toBe('en');
    });
  });

  describe('pt 로케일 (i18n-pt-br-bot)', () => {
    it('Discord pt-BR → pt 로 매핑된다 (앞 2자 매핑, 코드 변경 없음)', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: null });

      const result = await service.resolve('user-1', null, 'pt-BR');

      expect(result).toBe('pt');
    });

    it('저장된 user locale pt → pt 를 그대로 반환하고 interaction.locale 은 무시한다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: 'pt' });

      const result = await service.resolve('user-1', 'guild-1', 'ko-KR');

      expect(result).toBe('pt');
    });
  });

  describe('getUserLocale 예외 흡수 (EC-RP-51 — 봇 커맨드 전체가 API 장애로 죽으면 안 됨)', () => {
    it('타임아웃/네트워크 오류 → 예외를 던지지 않고 2순위(interaction.locale)로 폴백한다', async () => {
      apiClient.getUserLocale.mockRejectedValue(new Error('ETIMEDOUT'));

      const result = await service.resolve('user-1', 'guild-1', 'ko-KR');

      expect(result).toBe('ko');
    });

    it('5xx 응답(Error로 표현) → 예외를 던지지 않고 interaction.locale도 없으면 기본값 en', async () => {
      apiClient.getUserLocale.mockRejectedValue(new Error('API 500'));

      const result = await service.resolve('user-1', 'guild-1');

      expect(result).toBe('en');
    });

    it('getUserLocale이 reject해도 resolve() 자체는 reject하지 않는다', async () => {
      apiClient.getUserLocale.mockRejectedValue(new Error('네트워크 오류'));

      await expect(service.resolve('user-1', 'guild-1', 'en-US')).resolves.toBe('en');
    });
  });

  describe('🔒 길드(서버) locale 미포함 원칙 (F-GENERAL-004/005)', () => {
    it('guildId가 있어도 길드 locale을 조회하지 않는다(_guildId 미사용 파라미터) — apiClient는 user 조회만 호출된다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: null });

      await service.resolve('user-1', 'guild-1', 'ko-KR');

      // BotApiClientService에는 getUserLocale 외 다른 메서드가 호출되지 않는다(guild locale 조회 없음)
      expect(apiClient.getUserLocale).toHaveBeenCalledTimes(1);
    });

    it('guildId가 null이어도 동일하게 동작한다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: null });

      const result = await service.resolve('user-1', null, 'ko-KR');

      expect(result).toBe('ko');
    });
  });
  describe('저장값 검증 — 지원 목록 밖 값은 다음 순위로 낙하 (F-GENERAL-007)', () => {
    it('저장된 locale 이 지원 목록 밖(철회된 로케일)이면 interaction.locale 매핑으로 낙하한다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: 'xx' });

      const result = await service.resolve('user-1', 'guild-1', 'ko-KR');

      expect(result).toBe('ko');
    });

    it('저장값·interaction.locale 모두 지원 목록 밖이면 기본값 en 을 반환한다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: 'xx' });

      const result = await service.resolve('user-1', 'guild-1', 'ja');

      expect(result).toBe('en');
    });

    it('빈 문자열 저장값은 지원 값으로 취급하지 않고 낙하한다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: '' });

      const result = await service.resolve('user-1', 'guild-1', 'ko-KR');

      expect(result).toBe('ko');
    });

    it('지원되는 저장값(en)은 interaction.locale(ko-KR)보다 우선하고 그대로 반환된다', async () => {
      apiClient.getUserLocale.mockResolvedValue({ locale: 'en' });

      const result = await service.resolve('user-1', 'guild-1', 'ko-KR');

      expect(result).toBe('en');
    });
  });
});
