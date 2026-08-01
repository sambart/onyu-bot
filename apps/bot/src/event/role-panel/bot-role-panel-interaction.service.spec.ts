/**
 * RolePanelInteractionService 단위 테스트
 *
 * 커버 케이스:
 * - handle: API config 조회 실패 → NOT_FOUND
 * - handle: panelId/buttonId 미존재 → NOT_FOUND
 * - GRANT 멱등: 이미 역할 보유 → ALREADY_HAS (roles.add 미호출)
 * - GRANT: 미보유 → roles.add 호출 → GRANTED
 * - TOGGLE: 보유 → roles.remove → REMOVED
 * - TOGGLE: 미보유 → roles.add → GRANTED
 * - TOGGLE: 동시 호출 → 첫 번째 성공, 두 번째 LOCKED (EC-RP-16)
 * - mapDiscordError: 50013 → NO_PERMISSION
 * - mapDiscordError: 403 status → NO_PERMISSION
 * - mapDiscordError: 10011 → UNKNOWN_ROLE
 * - mapDiscordError: 그 외 DiscordAPIError → 재던짐
 * - mapDiscordError: 비-DiscordAPIError → 재던짐
 */

import { DiscordAPIError, type GuildMember } from 'discord.js';
import { type Mock } from 'vitest';

import {
  type HandleRolePanelButtonInput,
  RolePanelInteractionService,
} from './bot-role-panel-interaction.service';

/**
 * GuildMember 최소 mock 생성.
 * - `hasRole`(기존): 모든 역할에 대해 동일한 보유 여부를 반환(단일 역할 시나리오용, 하위 호환 유지).
 * - `ownedRoleIds`(신규): 역할 ID별 개별 보유 여부를 반환(다중 역할/EXCLUSIVE 부분 보유 시나리오용).
 *   둘 다 주어지면 `ownedRoleIds`가 우선한다.
 */
function makeMember(overrides: { hasRole?: boolean; ownedRoleIds?: string[] } = {}): GuildMember {
  const { hasRole = false, ownedRoleIds } = overrides;
  const owned = ownedRoleIds ? new Set(ownedRoleIds) : null;
  return {
    roles: {
      cache: {
        has: vi.fn((id: string) => (owned ? owned.has(id) : hasRole)),
      },
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    guild: {},
    user: { id: 'user-1' },
  } as unknown as GuildMember;
}

/** DiscordAPIError mock 생성 */
function makeDiscordAPIError(code: number, status = 400): DiscordAPIError {
  const err = new Error('Discord API Error') as DiscordAPIError;
  Object.setPrototypeOf(err, DiscordAPIError.prototype);
  (err as unknown as { code: number }).code = code;
  (err as unknown as { status: number }).status = status;
  return err;
}

/** 기본 HandleRolePanelButtonInput 픽스처 */
function makeInput(
  overrides: Partial<HandleRolePanelButtonInput> = {},
): HandleRolePanelButtonInput {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    member: makeMember(),
    panelId: 1,
    buttonId: 10,
    ...overrides,
  };
}

/** 기본 API config 응답 픽스처 */
function makeConfigResponse(mode: 'GRANT' | 'TOGGLE' = 'GRANT') {
  return {
    ok: true,
    data: [
      {
        panelId: 1,
        buttons: [
          {
            buttonId: 10,
            roleIds: ['role-1'],
            mode,
            exclusiveGroupKey: null,
            localeTag: null,
          },
        ],
      },
    ],
  };
}

/** 게이트 예시 형태의 EXCLUSIVE 형제 버튼 2개(정회원+언어) 구성 config 응답 픽스처 (UC-06) */
function makeExclusiveConfigResponse(
  overrides: {
    panelId?: number;
    groupKey?: string;
    buttons?: Array<{
      buttonId: number;
      roleIds: string[];
      mode?: 'GRANT' | 'TOGGLE' | 'EXCLUSIVE';
      exclusiveGroupKey?: string | null;
      localeTag?: 'ko' | 'en' | null;
    }>;
  } = {},
) {
  const panelId = overrides.panelId ?? 1;
  const groupKey = overrides.groupKey ?? 'onboarding-lang';
  const buttons = overrides.buttons ?? [
    {
      buttonId: 10,
      roleIds: ['role-member', 'role-ko'],
      mode: 'EXCLUSIVE' as const,
      exclusiveGroupKey: groupKey,
      localeTag: 'ko' as const,
    },
    {
      buttonId: 11,
      roleIds: ['role-member', 'role-en'],
      mode: 'EXCLUSIVE' as const,
      exclusiveGroupKey: groupKey,
      localeTag: 'en' as const,
    },
  ];

  return {
    ok: true,
    data: [
      {
        panelId,
        buttons: buttons.map((b) => ({
          exclusiveGroupKey: null,
          localeTag: null,
          mode: 'EXCLUSIVE' as const,
          ...b,
        })),
      },
    ],
  };
}

describe('RolePanelInteractionService', () => {
  let service: RolePanelInteractionService;
  let apiClient: { getRolePanelConfig: Mock };

  beforeEach(() => {
    apiClient = {
      getRolePanelConfig: vi.fn(),
    };

    service = new RolePanelInteractionService(apiClient as never);

    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  // handle — config 조회 실패
  // ──────────────────────────────────────────────────────
  describe('handle — config 조회 실패', () => {
    it('API 응답 ok=false 시 NOT_FOUND 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({ ok: false });

      const result = await service.handle(makeInput());

      expect(result.status).toBe('NOT_FOUND');
    });

    it('API 응답 data=null 시 NOT_FOUND 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({ ok: true, data: null });

      const result = await service.handle(makeInput());

      expect(result.status).toBe('NOT_FOUND');
    });

    it('panelId가 데이터에 없으면 NOT_FOUND 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({
        ok: true,
        data: [{ panelId: 999, buttons: [] }],
      });

      const result = await service.handle(makeInput({ panelId: 1 }));

      expect(result.status).toBe('NOT_FOUND');
    });

    it('buttonId가 패널에 없으면 NOT_FOUND 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({
        ok: true,
        data: [
          {
            panelId: 1,
            buttons: [
              {
                buttonId: 99,
                roleIds: ['role-1'],
                mode: 'GRANT',
                exclusiveGroupKey: null,
                localeTag: null,
              },
            ],
          },
        ],
      });

      const result = await service.handle(makeInput({ buttonId: 10 }));

      expect(result.status).toBe('NOT_FOUND');
    });
  });

  // ──────────────────────────────────────────────────────
  // GRANT 모드 (UC-04)
  // ──────────────────────────────────────────────────────
  describe('GRANT 모드', () => {
    it('이미 역할 보유 시 roles.add 미호출 + ALREADY_HAS 반환 (멱등)', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: true });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('ALREADY_HAS');
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('역할 미보유 시 roles.add 호출 + GRANTED 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledWith('role-1');
    });
  });

  // ──────────────────────────────────────────────────────
  // TOGGLE 모드 (UC-05)
  // ──────────────────────────────────────────────────────
  describe('TOGGLE 모드', () => {
    it('역할 보유 시 roles.remove 호출 + REMOVED 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('TOGGLE'));
      const member = makeMember({ hasRole: true });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('REMOVED');
      expect(member.roles.remove).toHaveBeenCalledWith('role-1');
    });

    it('역할 미보유 시 roles.add 호출 + GRANTED 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('TOGGLE'));
      const member = makeMember({ hasRole: false });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledWith('role-1');
    });

    it('EC-RP-16: 동일 키 동시 TOGGLE 호출 → 첫 번째 성공, 두 번째 LOCKED', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('TOGGLE'));

      // 첫 번째 호출: roles.add가 느리게 완료 (락이 잡혀 있는 동안 두 번째 시도)
      let resolveFirstAdd!: () => void;
      const firstMember = makeMember({ hasRole: false });
      (firstMember.roles.add as Mock).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveFirstAdd = resolve;
        }),
      );

      const secondMember = makeMember({ hasRole: false });

      const input = makeInput({ guildId: 'guild-lock', userId: 'user-lock', buttonId: 10 });

      // 첫 번째 호출 시작 (아직 완료 안 됨)
      const firstPromise = service.handle({ ...input, member: firstMember });
      // 두 번째 호출 즉시 실행 (락 점유 중)
      const secondResult = await service.handle({ ...input, member: secondMember });

      expect(secondResult.status).toBe('LOCKED');

      // 첫 번째 완료
      resolveFirstAdd();
      const firstResult = await firstPromise;
      expect(firstResult.status).toBe('GRANTED');
    });
  });

  // ──────────────────────────────────────────────────────
  // Discord 에러 매핑
  // ──────────────────────────────────────────────────────
  describe('mapDiscordError', () => {
    it('DiscordAPIError code=50013 → NO_PERMISSION', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(50013, 403));

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('NO_PERMISSION');
    });

    it('DiscordAPIError status=403 → NO_PERMISSION', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      // code는 다르지만 status=403
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(99999, 403));

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('NO_PERMISSION');
    });

    it('DiscordAPIError code=10011 → UNKNOWN_ROLE', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(10011));

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('UNKNOWN_ROLE');
    });

    it('그 외 DiscordAPIError(알 수 없는 코드) → 재던짐', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(99999, 500));

      await expect(service.handle(makeInput({ member }))).rejects.toBeInstanceOf(DiscordAPIError);
    });

    it('비-DiscordAPIError(일반 Error) → 재던짐', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      (member.roles.add as Mock).mockRejectedValue(new Error('네트워크 오류'));

      await expect(service.handle(makeInput({ member }))).rejects.toThrow('네트워크 오류');
    });
  });

  // ──────────────────────────────────────────────────────
  // 각 호출마다 guildId를 사용한 config 조회
  // ──────────────────────────────────────────────────────
  describe('API 호출 검증', () => {
    it('guildId로 getRolePanelConfig 호출', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });

      await service.handle(makeInput({ guildId: 'my-guild', member }));

      expect(apiClient.getRolePanelConfig).toHaveBeenCalledWith('my-guild');
    });
  });

  // ──────────────────────────────────────────────────────
  // GRANT 3분기 (F-ROLE-PANEL-008 배열화 — 부분 보유, EC-RP-19 개정)
  // ──────────────────────────────────────────────────────
  describe('GRANT 모드 — 다중 역할 3분기', () => {
    it('일부만 보유(2개 중 1개) → 미보유분만 add + GRANTED (보유분은 재부여하지 않음)', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({
          groupKey: 'na',
          buttons: [{ buttonId: 10, roleIds: ['role-1', 'role-2'], mode: 'GRANT' }],
        }),
      );
      const member = makeMember({ ownedRoleIds: ['role-1'] });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledTimes(1);
      expect(member.roles.add).toHaveBeenCalledWith('role-2');
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('전부 보유 → ALREADY_HAS, Discord API 0회', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({
          groupKey: 'na',
          buttons: [{ buttonId: 10, roleIds: ['role-1', 'role-2'], mode: 'GRANT' }],
        }),
      );
      const member = makeMember({ ownedRoleIds: ['role-1', 'role-2'] });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('ALREADY_HAS');
      expect(member.roles.add).not.toHaveBeenCalled();
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('전부 미보유 → 전부 add + GRANTED', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({
          groupKey: 'na',
          buttons: [{ buttonId: 10, roleIds: ['role-1', 'role-2'], mode: 'GRANT' }],
        }),
      );
      const member = makeMember({ ownedRoleIds: [] });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledTimes(2);
      expect(member.roles.add).toHaveBeenCalledWith('role-1');
      expect(member.roles.add).toHaveBeenCalledWith('role-2');
    });
  });

  // ──────────────────────────────────────────────────────
  // TOGGLE 3분기 (F-ROLE-PANEL-007 개정 — 일부 보유 시 회수 금지)
  // ──────────────────────────────────────────────────────
  describe('TOGGLE 모드 — 다중 역할 3분기', () => {
    it('전부 보유 → 전부 remove + REMOVED', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({
          groupKey: 'na',
          buttons: [{ buttonId: 10, roleIds: ['role-1', 'role-2'], mode: 'TOGGLE' }],
        }),
      );
      const member = makeMember({ ownedRoleIds: ['role-1', 'role-2'] });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('REMOVED');
      expect(member.roles.remove).toHaveBeenCalledTimes(2);
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('전부 미보유 → 전부 add + GRANTED', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({
          groupKey: 'na',
          buttons: [{ buttonId: 10, roleIds: ['role-1', 'role-2'], mode: 'TOGGLE' }],
        }),
      );
      const member = makeMember({ ownedRoleIds: [] });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledTimes(2);
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('일부만 보유(2개 중 1개) → 미보유분만 add + GRANTED (보유분 회수 금지 — "절반만 잃는" 상태 방지)', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({
          groupKey: 'na',
          buttons: [{ buttonId: 10, roleIds: ['role-1', 'role-2'], mode: 'TOGGLE' }],
        }),
      );
      const member = makeMember({ ownedRoleIds: ['role-1'] });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledTimes(1);
      expect(member.roles.add).toHaveBeenCalledWith('role-2');
      expect(member.roles.remove).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // EXCLUSIVE 모드 (UC-06 — 규칙 동의 게이트 정본 시나리오)
  // ──────────────────────────────────────────────────────
  describe('EXCLUSIVE 모드 — 판정 3분기 (K-1)', () => {
    it('S-01 최초 클릭: 그룹 무보유 → add(정회원,한국어) 2회, remove 0회, GRANTED, localeTag=ko', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeExclusiveConfigResponse());
      const member = makeMember({ ownedRoleIds: [] });

      const result = await service.handle(makeInput({ buttonId: 10, member }));

      expect(result.status).toBe('GRANTED');
      expect(result.localeTag).toBe('ko');
      expect(member.roles.add).toHaveBeenCalledTimes(2);
      expect(member.roles.add).toHaveBeenCalledWith('role-member');
      expect(member.roles.add).toHaveBeenCalledWith('role-ko');
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('S-02 언어 전환: 한국어 보유 상태에서 영어 버튼 클릭 → remove(한국어) 1회 + add(English) 1회, 정회원 미호출, SWAPPED', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeExclusiveConfigResponse());
      const member = makeMember({ ownedRoleIds: ['role-member', 'role-ko'] });

      const result = await service.handle(makeInput({ buttonId: 11, member }));

      expect(result.status).toBe('SWAPPED');
      expect(result.localeTag).toBe('en');
      expect(member.roles.remove).toHaveBeenCalledTimes(1);
      expect(member.roles.remove).toHaveBeenCalledWith('role-ko');
      expect(member.roles.add).toHaveBeenCalledTimes(1);
      expect(member.roles.add).toHaveBeenCalledWith('role-en');
      // 정회원(공통 역할)은 이미 보유 중이므로 add/remove 어느 쪽도 호출되지 않는다
      expect(member.roles.add).not.toHaveBeenCalledWith('role-member');
      expect(member.roles.remove).not.toHaveBeenCalledWith('role-member');
    });

    it('S-03 동일 버튼 재클릭: Discord API 0회, ALREADY_SELECTED', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeExclusiveConfigResponse());
      const member = makeMember({ ownedRoleIds: ['role-member', 'role-ko'] });

      const result = await service.handle(makeInput({ buttonId: 10, member }));

      expect(result.status).toBe('ALREADY_SELECTED');
      expect(member.roles.add).not.toHaveBeenCalled();
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('🔒 회수 → 부여 순서 고정 — remove가 add보다 먼저 호출된다', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeExclusiveConfigResponse());
      const member = makeMember({ ownedRoleIds: ['role-member', 'role-ko'] });
      const callOrder: string[] = [];
      (member.roles.remove as Mock).mockImplementation(async () => {
        callOrder.push('remove');
      });
      (member.roles.add as Mock).mockImplementation(async () => {
        callOrder.push('add');
      });

      await service.handle(makeInput({ buttonId: 11, member }));

      expect(callOrder).toEqual(['remove', 'add']);
    });

    it('형제 없는 단독 그룹 → revoke 공집합, 부여만 수행되어 GRANTED(GRANT와 동등)', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({
          groupKey: 'solo-group',
          buttons: [
            {
              buttonId: 20,
              roleIds: ['role-solo'],
              mode: 'EXCLUSIVE',
              exclusiveGroupKey: 'solo-group',
              localeTag: null,
            },
          ],
        }),
      );
      const member = makeMember({ ownedRoleIds: [] });

      const result = await service.handle(makeInput({ buttonId: 20, member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledTimes(1);
      expect(member.roles.add).toHaveBeenCalledWith('role-solo');
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('exclusiveGroupKey=null인 EXCLUSIVE 버튼(방어) → GRANT 폴백', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({
          groupKey: 'na',
          buttons: [
            {
              buttonId: 30,
              roleIds: ['role-defensive'],
              mode: 'EXCLUSIVE',
              exclusiveGroupKey: null,
              localeTag: null,
            },
          ],
        }),
      );
      const member = makeMember({ ownedRoleIds: ['role-defensive'] });

      const result = await service.handle(makeInput({ buttonId: 30, member }));

      // GRANT 폴백이므로 ALREADY_SELECTED가 아니라 ALREADY_HAS(GRANT 멱등 상태값)가 반환된다
      expect(result.status).toBe('ALREADY_HAS');
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('형제 판별은 mode===EXCLUSIVE AND exclusiveGroupKey===groupKey 동시 검사 — 그룹 키 잔여값만 있는 GRANT 버튼은 형제로 집계하지 않는다 (EC-RP-35 이중 방어)', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({
        ok: true,
        data: [
          {
            panelId: 1,
            buttons: [
              {
                buttonId: 10,
                roleIds: ['role-member', 'role-ko'],
                mode: 'EXCLUSIVE',
                exclusiveGroupKey: 'onboarding-lang',
                localeTag: 'ko',
              },
              // GRANT 모드인데 exclusiveGroupKey 잔여값이 남아있는 버튼 — 형제로 집계되면 안 된다
              {
                buttonId: 99,
                roleIds: ['role-stray'],
                mode: 'GRANT',
                exclusiveGroupKey: 'onboarding-lang',
                localeTag: null,
              },
            ],
          },
        ],
      });
      const member = makeMember({ ownedRoleIds: [] });

      const result = await service.handle(makeInput({ buttonId: 10, member }));

      expect(result.status).toBe('GRANTED');
      // role-stray는 universe에 포함되지 않아야 하며, 부여/회수 어느 쪽도 대상이 아니다
      expect(member.roles.add).not.toHaveBeenCalledWith('role-stray');
      expect(member.roles.remove).not.toHaveBeenCalledWith('role-stray');
      expect(member.roles.add).toHaveBeenCalledTimes(2);
    });

    it('그룹 경계는 같은 panelId 내부 — 다른 패널의 동일 그룹 키 버튼은 형제가 아니다', async () => {
      // panelConfig는 panelId로 조회된 패널의 buttons만 담으므로, 다른 패널 버튼은애초에
      // siblingButtons 배열에 섞이지 않는다는 구조적 보장을 확인한다.
      apiClient.getRolePanelConfig.mockResolvedValue({
        ok: true,
        data: [
          {
            panelId: 1,
            buttons: [
              {
                buttonId: 10,
                roleIds: ['role-member', 'role-ko'],
                mode: 'EXCLUSIVE',
                exclusiveGroupKey: 'shared-key',
                localeTag: 'ko',
              },
            ],
          },
          {
            panelId: 2,
            buttons: [
              {
                buttonId: 50,
                roleIds: ['role-unrelated'],
                mode: 'EXCLUSIVE',
                exclusiveGroupKey: 'shared-key',
                localeTag: null,
              },
            ],
          },
        ],
      });
      const member = makeMember({ ownedRoleIds: [] });

      const result = await service.handle(makeInput({ panelId: 1, buttonId: 10, member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).not.toHaveBeenCalledWith('role-unrelated');
      expect(member.roles.remove).not.toHaveBeenCalledWith('role-unrelated');
    });
  });

  describe('EXCLUSIVE 모드 — 그룹 단위 락 (K-2)', () => {
    it('같은 버튼 연타(50ms 간격) → 첫 요청만 처리, 두 번째 LOCKED', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({ groupKey: 'lock-group-same-button' }),
      );

      let resolveFirstAdd!: () => void;
      const firstMember = makeMember({ ownedRoleIds: [] });
      (firstMember.roles.add as Mock).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveFirstAdd = resolve;
        }),
      );
      const secondMember = makeMember({ ownedRoleIds: [] });

      const input = makeInput({
        guildId: 'guild-excl-lock-1',
        userId: 'user-excl-lock-1',
        buttonId: 10,
      });

      const firstPromise = service.handle({ ...input, member: firstMember });
      const secondResult = await service.handle({ ...input, member: secondMember });

      expect(secondResult.status).toBe('LOCKED');
      // 락 획득 실패 시 Discord 역할 API를 아예 호출하지 않는다(락 → 권한/API 순서, EC-RP-43)
      expect(secondMember.roles.add).not.toHaveBeenCalled();
      expect(secondMember.roles.remove).not.toHaveBeenCalled();

      resolveFirstAdd();
      const firstResult = await firstPromise;
      expect(firstResult.status).toBe('GRANTED');
    });

    it('⭐ EC-RP-44: 같은 그룹의 서로 다른 두 버튼(🇰🇷/🇬🇧) 동시 클릭 → 두 번째 LOCKED (버튼 단위 락 재사용 시 회귀 재현 지점 — 같은 버튼 연타 테스트만으로는 이 회귀를 잡지 못한다)', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(
        makeExclusiveConfigResponse({ groupKey: 'lock-group-diff-button' }),
      );

      let resolveFirstAdd!: () => void;
      const firstMember = makeMember({ ownedRoleIds: [] });
      (firstMember.roles.add as Mock).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveFirstAdd = resolve;
        }),
      );
      const secondMember = makeMember({ ownedRoleIds: [] });

      const base = {
        guildId: 'guild-excl-lock-2',
        userId: 'user-excl-lock-2',
      };

      // 버튼 10(🇰🇷) 클릭 시작 (아직 완료 안 됨) — 버튼 11(🇬🇧)과 groupKey가 같으므로 같은 락 키를 공유해야 한다
      const firstPromise = service.handle(
        makeInput({ ...base, buttonId: 10, member: firstMember }),
      );
      // 버튼 11(🇬🇧) 즉시 클릭 — buttonId가 다르므로 버튼 단위 락이었다면 여기서 통과해버린다
      const secondResult = await service.handle(
        makeInput({ ...base, buttonId: 11, member: secondMember }),
      );

      expect(secondResult.status).toBe('LOCKED');
      expect(secondMember.roles.add).not.toHaveBeenCalled();
      expect(secondMember.roles.remove).not.toHaveBeenCalled();

      resolveFirstAdd();
      const firstResult = await firstPromise;
      expect(firstResult.status).toBe('GRANTED');
    });
  });

  describe('EXCLUSIVE 모드 — 부분 실패 best-effort (K-3)', () => {
    it('2개 중 1개 실패(50013) → 나머지 계속 처리되어 성공 상태 유지', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeExclusiveConfigResponse());
      const member = makeMember({ ownedRoleIds: [] });
      (member.roles.add as Mock).mockImplementation(async (roleId: string) => {
        if (roleId === 'role-member') {
          throw makeDiscordAPIError(50013, 403);
        }
      });

      const result = await service.handle(makeInput({ buttonId: 10, member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledWith('role-member');
      expect(member.roles.add).toHaveBeenCalledWith('role-ko');
    });

    it('전부 실패(50013) → NO_PERMISSION', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeExclusiveConfigResponse());
      const member = makeMember({ ownedRoleIds: [] });
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(50013, 403));

      const result = await service.handle(makeInput({ buttonId: 10, member }));

      expect(result.status).toBe('NO_PERMISSION');
    });

    it('비-DiscordAPIError는 개별 루프 밖으로 즉시 재던짐(삼키지 않음)', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeExclusiveConfigResponse());
      const member = makeMember({ ownedRoleIds: [] });
      (member.roles.add as Mock).mockRejectedValue(new Error('네트워크 오류'));

      await expect(service.handle(makeInput({ buttonId: 10, member }))).rejects.toThrow(
        '네트워크 오류',
      );
    });
  });
});
