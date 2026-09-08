/**
 * tryConsumeMissionRefresh 단위 테스트 (docs/plans/admin-action-guard-fixes.md W6 §7.1, §10.5 #54~55).
 */
import { resetMissionRefreshCooldown, tryConsumeMissionRefresh } from './mission-refresh-cooldown';

const COOLDOWN_MS = 10_000;

describe('tryConsumeMissionRefresh', () => {
  beforeEach(() => {
    resetMissionRefreshCooldown();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('#54: 첫 호출은 true, 즉시 두 번째 호출은 false, 10초 경과 후 다시 true', () => {
    const key = 'guild-1:channel-1';

    expect(tryConsumeMissionRefresh(key)).toBe(true);
    expect(tryConsumeMissionRefresh(key)).toBe(false);

    vi.advanceTimersByTime(COOLDOWN_MS - 1);
    expect(tryConsumeMissionRefresh(key)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(tryConsumeMissionRefresh(key)).toBe(true);
  });

  it('#55: 채널이 다르면 서로 쿨다운에 영향을 주지 않는다', () => {
    expect(tryConsumeMissionRefresh('guild-1:channel-1')).toBe(true);
    expect(tryConsumeMissionRefresh('guild-1:channel-2')).toBe(true);
    expect(tryConsumeMissionRefresh('guild-1:channel-1')).toBe(false);
    expect(tryConsumeMissionRefresh('guild-1:channel-2')).toBe(false);
  });

  it('resetMissionRefreshCooldown() 호출 시 모든 쿨다운이 즉시 해제된다(테스트 전용)', () => {
    const key = 'guild-1:channel-1';
    expect(tryConsumeMissionRefresh(key)).toBe(true);
    expect(tryConsumeMissionRefresh(key)).toBe(false);

    resetMissionRefreshCooldown();

    expect(tryConsumeMissionRefresh(key)).toBe(true);
  });
});
