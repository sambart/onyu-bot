import { describe, expect, it } from 'vitest';

import { BotI18nService } from './bot-i18n.service';
import { MESSAGE_CODE_TO_BOT_KEY, resolveResultMessage } from './message-code-map';

/**
 * resolveResultMessage 단위 테스트 — R4 결과 봉투 code→로케일 폴백 3분기 검증(§5).
 * raw code/키가 사용자에게 노출되지 않는지가 핵심 불변식이다.
 */
describe('resolveResultMessage', () => {
  function createI18n(): BotI18nService {
    const i18n = new BotI18nService();
    i18n.onModuleInit();
    return i18n;
  }

  it('매핑된 code 는 로케일 키로 번역되어 반환된다 (ko)', () => {
    const i18n = createI18n();
    const result = {
      code: 'AUTO_CHANNEL_CREATED',
      params: { channelName: '테스트방' },
      message: '**테스트방** 방이 생성되었습니다!',
    };

    const text = resolveResultMessage(i18n, 'ko', result);

    expect(text).toBe('**테스트방** 방이 생성되었습니다!');
  });

  it('매핑된 code 는 로케일 키로 번역되어 반환된다 (en)', () => {
    const i18n = createI18n();
    const result = {
      code: 'STATUS_PREFIX_APPLIED',
      params: { nickname: 'Tester' },
      message: '닉네임이 **Tester** 으로 변경되었습니다.',
    };

    const text = resolveResultMessage(i18n, 'en', result);

    expect(text).toBe('Your nickname has been changed to **Tester**.');
  });

  it('미매핑 code 는 result.message 원문으로 폴백한다', () => {
    const i18n = createI18n();
    const result = {
      code: 'UNKNOWN_CODE',
      message: '알 수 없는 코드 원문 메시지',
    };

    const text = resolveResultMessage(i18n, 'ko', result);

    expect(text).toBe('알 수 없는 코드 원문 메시지');
    expect(text).not.toContain('UNKNOWN_CODE');
  });

  it('code 자체가 없으면 result.message 원문으로 폴백한다(구 API 호환)', () => {
    const i18n = createI18n();
    const result = { message: '구 API 메시지' };

    const text = resolveResultMessage(i18n, 'ko', result);

    expect(text).toBe('구 API 메시지');
  });
});

/**
 * MESSAGE_CODE_TO_BOT_KEY 계약 무결성 (R4 §3.7) — 맵의 모든 값(로케일 키)이
 * 실제 ko/en 로케일 JSON에 존재하는지 검증한다. 오타 키(예: 'commands.autChannelCreated')는
 * BotI18nService.t()가 원문 key를 그대로 반환하게 되어 resolveResultMessage가
 * 조용히 result.message로 폴백해버리므로(§5 불변식), 실사용 전까지 회귀가 드러나지 않는다.
 * 이 spec은 그 오타 회귀를 여기서 직접 감지한다.
 */
describe('MESSAGE_CODE_TO_BOT_KEY — 로케일 키 존재 계약(오타 회귀 방지)', () => {
  it('맵의 모든 값이 ko/en 로케일 파일에 실재하는 키다 (원문 키 그대로 반환되지 않는다)', () => {
    const i18n = new BotI18nService();
    i18n.onModuleInit();

    const entries = Object.entries(MESSAGE_CODE_TO_BOT_KEY);
    expect(entries.length).toBeGreaterThan(0);

    for (const [code, key] of entries) {
      expect(i18n.t('ko', key), `code=${code} key=${key} (ko)`).not.toBe(key);
      expect(i18n.t('en', key), `code=${code} key=${key} (en)`).not.toBe(key);
    }
  });
});
