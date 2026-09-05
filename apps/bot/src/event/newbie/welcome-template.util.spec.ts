/**
 * welcome-template.util 단위 테스트 (F-NEWBIE-009, 계획 §S1-2 / T1).
 *
 * 회귀 위험 최고 지점 — `stripUnfilledMissionLines`는 미션 변수를 전혀 쓰지 않는 기존 길드
 * 템플릿의 동작을 완전히 무변경으로 보존해야 한다. 이 계약이 깨지면 기존 전 길드의 환영
 * 메시지가 바뀐다.
 */
import type { MissionVarsConfig } from './welcome-template.util';
import {
  buildMissionVars,
  MISSION_VAR_NAMES,
  stripUnfilledMissionLines,
  toOptionalText,
} from './welcome-template.util';

function makeMissionVarsConfig(overrides: Partial<MissionVarsConfig> = {}): MissionVarsConfig {
  return {
    missionEnabled: true,
    missionTargetPlaytimeHours: 20,
    missionTargetPlayCount: 10,
    missionDurationDays: 7,
    missionNotifyChannelId: 'ch-1',
    ...overrides,
  };
}

describe('buildMissionVars', () => {
  it('missionEnabled=true + 전체 필드 설정 시 4개 변수 모두 값이 채워진다', () => {
    const result = buildMissionVars(makeMissionVarsConfig());

    expect(result).toEqual({
      missionTargetPlaytime: '20',
      missionTargetPlayCount: '10',
      missionDurationDays: '7',
      missionChannel: '<#ch-1>',
    });
  });

  it('missionEnabled=false이면 4개 변수 전부 빈 문자열이다(다른 필드가 채워져 있어도)', () => {
    const result = buildMissionVars(makeMissionVarsConfig({ missionEnabled: false }));

    expect(result).toEqual({
      missionTargetPlaytime: '',
      missionTargetPlayCount: '',
      missionDurationDays: '',
      missionChannel: '',
    });
  });

  it('missionEnabled=true여도 missionTargetPlaytimeHours가 null이면 해당 변수만 빈 문자열', () => {
    const result = buildMissionVars(makeMissionVarsConfig({ missionTargetPlaytimeHours: null }));

    expect(result.missionTargetPlaytime).toBe('');
    expect(result.missionTargetPlayCount).toBe('10');
    expect(result.missionDurationDays).toBe('7');
    expect(result.missionChannel).toBe('<#ch-1>');
  });

  it('missionTargetPlayCount가 null이면 그 변수만 빈 문자열(UC-03 대안 플로우 2 핵심 케이스)', () => {
    const result = buildMissionVars(makeMissionVarsConfig({ missionTargetPlayCount: null }));

    expect(result.missionTargetPlayCount).toBe('');
    expect(result.missionTargetPlaytime).toBe('20');
    expect(result.missionDurationDays).toBe('7');
    expect(result.missionChannel).toBe('<#ch-1>');
  });

  it('missionDurationDays가 null이면 그 변수만 빈 문자열', () => {
    const result = buildMissionVars(makeMissionVarsConfig({ missionDurationDays: null }));

    expect(result.missionDurationDays).toBe('');
    expect(result.missionTargetPlaytime).toBe('20');
    expect(result.missionTargetPlayCount).toBe('10');
  });

  it('missionNotifyChannelId가 null이면 missionChannel만 빈 문자열', () => {
    const result = buildMissionVars(makeMissionVarsConfig({ missionNotifyChannelId: null }));

    expect(result.missionChannel).toBe('');
    expect(result.missionTargetPlaytime).toBe('20');
    expect(result.missionTargetPlayCount).toBe('10');
    expect(result.missionDurationDays).toBe('7');
  });

  it('missionNotifyChannelId가 빈 문자열이면 missionChannel도 빈 문자열(falsy 처리)', () => {
    const result = buildMissionVars(makeMissionVarsConfig({ missionNotifyChannelId: '' }));

    expect(result.missionChannel).toBe('');
  });

  it('값은 단위 없는 순수 숫자 문자열이다(단위 문구는 템플릿 쪽 고정 텍스트)', () => {
    const result = buildMissionVars(
      makeMissionVarsConfig({
        missionTargetPlaytimeHours: 100,
        missionTargetPlayCount: 3,
        missionDurationDays: 14,
      }),
    );

    expect(result.missionTargetPlaytime).toBe('100');
    expect(result.missionTargetPlayCount).toBe('3');
    expect(result.missionDurationDays).toBe('14');
    // 시간/일/회 등 단위 문구가 섞여 있지 않은지 확인
    expect(result.missionTargetPlaytime).not.toMatch(/[가-힣a-zA-Z]/);
    expect(result.missionDurationDays).not.toMatch(/[가-힣a-zA-Z]/);
  });

  it('missionChannel은 <#id> 멘션 형식이다', () => {
    const result = buildMissionVars(makeMissionVarsConfig({ missionNotifyChannelId: '999888777' }));

    expect(result.missionChannel).toBe('<#999888777>');
  });
});

describe('toOptionalText', () => {
  // T1-1(계획 §4) — 전처리 결과가 공백뿐이면 undefined를 반환해야 호출부가
  // EmbedBuilder.setTitle('')/setDescription('') 호출(throw 유발)을 건너뛸 수 있다.
  it("빈 문자열('')이면 undefined를 반환한다", () => {
    expect(toOptionalText('')).toBeUndefined();
  });

  it("공백만('   ')이면 undefined를 반환한다", () => {
    expect(toOptionalText('   ')).toBeUndefined();
  });

  it("개행만('\\n\\n')이면 undefined를 반환한다", () => {
    expect(toOptionalText('\n\n')).toBeUndefined();
  });

  // T1-2 — 내용이 있으면 원본을 그대로(동일 참조) 반환한다.
  it('공백이 아닌 값은 원본과 동일한 값을 그대로 반환한다(원본 동일성)', () => {
    const value = '안녕';

    const result = toOptionalText(value);

    expect(result).toBe(value);
  });

  it('앞뒤 공백이 있어도 내용이 있으면 trim하지 않고 원본 그대로 반환한다', () => {
    const value = '  안녕  ';

    const result = toOptionalText(value);

    expect(result).toBe(value);
  });
});

describe('stripUnfilledMissionLines', () => {
  it('미션 변수가 전혀 없는 템플릿은 원본 바이트 그대로 반환한다(회귀 가드)', () => {
    const template = 'Hello {username}!\n\n\nWelcome to {serverName}.\n\n';
    const vars: Record<string, string> = {
      username: '동현',
      serverName: '테스트 서버',
      missionTargetPlaytime: '',
      missionTargetPlayCount: '',
      missionDurationDays: '',
      missionChannel: '',
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    // 연속 빈 줄·trim 없이 원본과 완전히 동일해야 한다
    expect(result).toBe(template);
  });

  it('미션 변수가 있고 값이 전부 채워진 경우 해당 줄이 유지된다', () => {
    const template =
      'Hello {username}!\n미션: {missionTargetPlaytime}시간, {missionDurationDays}일';
    const vars: Record<string, string> = {
      username: '동현',
      missionTargetPlaytime: '20',
      missionTargetPlayCount: '',
      missionDurationDays: '7',
      missionChannel: '',
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    expect(result).toBe(template);
  });

  it('값이 빈 변수가 하나라도 포함된 줄은 그 줄만 삭제되고 다른 줄은 무영향', () => {
    const template = [
      'Line1 {username}',
      'Line2 {missionTargetPlaytime}시간 채우기',
      'Line3 {serverName}',
    ].join('\n');
    const vars: Record<string, string> = {
      username: '동현',
      serverName: '테스트 서버',
      missionTargetPlaytime: '', // 빈 값 → Line2 삭제 대상
      missionTargetPlayCount: '',
      missionDurationDays: '',
      missionChannel: '',
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    expect(result).toBe('Line1 {username}\nLine3 {serverName}');
  });

  it('missionNotifyChannelId 미설정(missionChannel 빈 값)이면 그 줄만 삭제된다', () => {
    const template = [
      '환영합니다 {username}',
      '{missionChannel}에서 진행 상황을 확인할 수 있어요.',
    ].join('\n');
    const vars: Record<string, string> = {
      username: '동현',
      missionTargetPlaytime: '20',
      missionTargetPlayCount: '',
      missionDurationDays: '7',
      missionChannel: '', // 채널 미설정
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    expect(result).toBe('환영합니다 {username}');
  });

  it('missionTargetPlayCount=null(빈 값)이고 그 변수를 안 쓰는 기본 문장은 영향받지 않는다', () => {
    const template =
      '미션이 시작됐어요! {missionDurationDays}일 동안 {missionTargetPlaytime}시간 채워보세요.';
    const vars: Record<string, string> = {
      missionTargetPlaytime: '20',
      missionTargetPlayCount: '', // 이 템플릿은 이 변수를 쓰지 않음
      missionDurationDays: '7',
      missionChannel: '<#ch-1>',
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    expect(result).toBe(template);
  });

  it('한 줄에 미션 변수 여러 개가 섞이고 일부만 빈 경우에도 그 줄은 삭제된다', () => {
    const template = [
      '목표: {missionTargetPlaytime}시간 / {missionTargetPlayCount}회, {missionDurationDays}일 안에',
      '고정 문구',
    ].join('\n');
    const vars: Record<string, string> = {
      missionTargetPlaytime: '20',
      missionTargetPlayCount: '', // 한 줄에 섞인 변수 중 하나만 비어 있어도 그 줄 전체 삭제
      missionDurationDays: '7',
      missionChannel: '',
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    expect(result).toBe('고정 문구');
  });

  it('삭제 발생 시 연속 빈 줄을 1개로 축약하고 앞뒤 공백을 trim한다', () => {
    const template = ['', '{missionChannel}에서 확인', '', '', '마지막 줄', ''].join('\n');
    const vars: Record<string, string> = {
      missionTargetPlaytime: '',
      missionTargetPlayCount: '',
      missionDurationDays: '',
      missionChannel: '', // 삭제 트리거
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    // 원래 줄 구성: ['', '{missionChannel}...', '', '', '마지막 줄', '']
    // '{missionChannel}...' 줄 삭제 후 남는 ['', '', '', '마지막 줄', '']는
    // 연속 빈 줄 축약으로 ['', '마지막 줄', ''] → trim → '마지막 줄'
    expect(result).toBe('마지막 줄');
  });

  it('missionEnabled=false로 4개 변수 모두 빈 문자열인 커스텀 템플릿 — 미션 관련 줄만 사라지고 나머지는 유지', () => {
    const template = [
      '{mention}님 환영합니다!',
      '미션 목표: {missionTargetPlaytime}시간, {missionDurationDays}일 - {missionChannel}',
      '즐거운 시간 되세요.',
    ].join('\n');
    const vars: Record<string, string> = {
      mention: '<@123>',
      missionTargetPlaytime: '',
      missionTargetPlayCount: '',
      missionDurationDays: '',
      missionChannel: '',
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    expect(result).toBe('{mention}님 환영합니다!\n즐거운 시간 되세요.');
  });

  // T1-3(계획 §4, F1 원인 사실 고정) — 모든 줄이 미션 변수를 포함하는 한 줄짜리 제목
  // 템플릿 + missionEnabled=false 조합은 결과가 정확히 ''이 된다. 이 사실 자체가 F1의
  // 트리거 조건이므로(원본 계획 §1-1 ③), 회귀 시 즉시 드러나야 한다.
  it("모든 줄이 미션 변수를 포함한 한 줄짜리 제목 템플릿은 결과가 정확히 ''이 된다(F1 트리거 조건)", () => {
    const template = '{missionDurationDays}일 미션 시작!';
    const vars: Record<string, string> = {
      missionTargetPlaytime: '',
      missionTargetPlayCount: '',
      missionDurationDays: '', // missionEnabled=false 가정 — buildMissionVars가 ''을 채운다
      missionChannel: '',
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    expect(result).toBe('');
  });

  it('미션 변수가 없는 줄에 포함된 일반 변수({username} 등)는 삭제 판정에 전혀 관여하지 않는다', () => {
    const template = 'Hi {username}, {undefinedVar}';
    // undefinedVar는 vars에 아예 없는 키 — MISSION_VAR_NAMES에 속하지 않으므로 판정 대상이 아니다
    const vars: Record<string, string> = {
      username: '동현',
      missionTargetPlaytime: '',
      missionTargetPlayCount: '',
      missionDurationDays: '',
      missionChannel: '',
    };

    const result = stripUnfilledMissionLines(template, MISSION_VAR_NAMES, vars);

    // 미션 변수를 포함하지 않는 줄이므로 원본 그대로 유지(단, 단일 줄 템플릿이라 삭제 자체가 없어
    // removed=false 경로를 타 원본 그대로 반환된다)
    expect(result).toBe(template);
  });
});
