/**
 * 길드 채널 게시 재발 방지 로컬 ESLint 플러그인 (채널 ID 길드 간 게시 감사 A8 —
 * docs/reviews/2026-10-26-channel-id-cross-guild-audit.md, 수리 PR #820).
 *
 * - guild-channel-send-requires-ownership-check :
 *   Discord 게시 sink(`this.discordRest.sendMessage(channelId, …)` 등) 호출 전에 같은 메서드 안에서
 *   채널 소속 검증(`GuildChannelOwnershipService` 의 assertChannelInGuild · isChannelInGuildForSend 등)을
 *   거쳤는지 정적으로 확인한다.
 *
 * 판정은 파일 단위 휴리스틱이다(타입 정보 미사용).
 * 1. 호출 대상: 메서드명이 sink 목록에 있고, 수신 객체 텍스트가 `discord` 를 포함하는 호출
 *    (`this.discordRest` / `this.discordRestService` / `this.discordAdapter` / `this.discordGateway`).
 * 2. 통과: 같은 클래스 멤버(메서드) 안에서 sink 호출보다 **앞서** 검증 호출이 있다. 검증 호출은
 *    검증 함수 자체이거나, 검증 함수를 (전이적으로) 부르는 같은 파일의 `this.xxx()` 메서드다.
 * 3. 통과: sink 를 품은 메서드가 같은 파일 안에서만 `this.method()` 로 불리고, 그 호출부가 모두
 *    2 를 만족한다(검증을 호출자에서 하는 private 헬퍼).
 * 4. 면제: sink 를 품은 메서드 이름 자체가 sink 이름이다 — 얇은 위임 어댑터는 그 호출부가 검사된다.
 *
 * 검증 결과를 실제로 분기에 쓰는지는 보지 않는다 — 호출 여부만 본다(리뷰로 확인).
 */

/**
 * 길드 채널로 새 메시지를 게시하는 sink 메서드명 — DiscordRestService 원시 메서드 + 도메인 위임 어댑터 메서드
 * (auto-channel `sendGuideMessage`, newbie mission `sendChannelMessage`). 수정(edit*)은 우리가 보낸 메시지 ID 가
 * 전제라 제외한다. 새 위임 어댑터 메서드를 만들면 여기에 추가해야 그 호출부가 검사된다.
 */
const DEFAULT_SINK_METHODS = [
  'sendMessage',
  'sendMessageWithFiles',
  'sendGuideMessage',
  'sendChannelMessage',
];

/**
 * 채널 소속 검증 함수 — `GuildChannelOwnershipService` 공개 메서드 + 이를 감싼 도메인 어댑터 메서드
 * (newbie `MissionDiscordActionService.isChannelInGuild`).
 */
const DEFAULT_GUARD_FUNCTIONS = [
  'assertChannelInGuild',
  'assertChannelsInGuild',
  'isChannelInGuildForSend',
  'resolveChannelOwnership',
  'isChannelInGuild',
];

/** sink 호출로 간주하는 수신 객체 텍스트 패턴 — Discord 게시 어댑터 계열로 좁혀 오탐을 줄인다. */
const RECEIVER_PATTERN = /discord/i;

/** 호출자 역추적 최대 깊이 — 무한 순환·과도한 전파 방지. */
const MAX_CALLER_DEPTH = 3;

function getCalleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return null;
}

function isThisCall(callee) {
  return callee.type === 'MemberExpression' && callee.object.type === 'ThisExpression';
}

function flattenMemberChain(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return `${flattenMemberChain(node.object)}.${node.property.name}`;
  }
  return '';
}

/** 가장 가까운 클래스 멤버(메서드 / 화살표 함수 프로퍼티)의 이름. 클래스 밖이면 null. */
function getEnclosingMemberName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      (current.type === 'MethodDefinition' || current.type === 'PropertyDefinition') &&
      !current.computed &&
      current.key.type === 'Identifier'
    ) {
      return current.key.name;
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const guildChannelSendRequiresOwnershipCheck = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          sinkMethods: { type: 'array', items: { type: 'string' } },
          guardFunctions: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unchecked:
        '길드 문맥의 `{{receiver}}.{{method}}(channelId, …)` 앞에 채널 소속 검증이 없습니다 — GuildChannelOwnershipService 의 assertChannelInGuild(저장·즉시 게시) / isChannelInGuildForSend(전송 시점) 를 먼저 호출하세요 (채널 ID 길드 간 게시 감사 A8). DM·운영 고정 채널이면 eslint-disable 과 why 주석을 남기세요.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const sinkMethods = new Set(options.sinkMethods ?? DEFAULT_SINK_METHODS);
    const guardFunctions = new Set(options.guardFunctions ?? DEFAULT_GUARD_FUNCTIONS);

    /** @type {{ node: import('estree').CallExpression, name: string | null, isThis: boolean, member: string | null, start: number }[]} */
    const calls = [];

    return {
      CallExpression(node) {
        calls.push({
          node,
          name: getCalleeName(node.callee),
          isThis: isThisCall(node.callee),
          member: getEnclosingMemberName(node),
          start: node.range[0],
        });
      },
      'Program:exit'() {
        // 검증 함수를 (전이적으로) 부르는 같은 파일 메서드 — 고정점까지 확장
        const guardCarriers = new Set();
        let isChanged = true;
        while (isChanged) {
          isChanged = false;
          for (const call of calls) {
            if (!call.member || guardCarriers.has(call.member)) continue;
            if (guardFunctions.has(call.name) || (call.isThis && guardCarriers.has(call.name))) {
              guardCarriers.add(call.member);
              isChanged = true;
            }
          }
        }

        const isGuardCall = (call) =>
          guardFunctions.has(call.name) || (call.isThis && guardCarriers.has(call.name));

        const isGuardedAt = (member, position, depth, visited) => {
          if (!member) return false;
          const hasLocalGuard = calls.some(
            (call) => call.member === member && call.start < position && isGuardCall(call),
          );
          if (hasLocalGuard) return true;
          if (depth >= MAX_CALLER_DEPTH || visited.has(member)) return false;
          const callers = calls.filter((call) => call.isThis && call.name === member);
          if (callers.length === 0) return false;
          const nextVisited = new Set(visited).add(member);
          return callers.every((caller) =>
            isGuardedAt(caller.member, caller.start, depth + 1, nextVisited),
          );
        };

        for (const call of calls) {
          if (!sinkMethods.has(call.name) || call.node.callee.type !== 'MemberExpression') continue;
          const receiver = flattenMemberChain(call.node.callee.object);
          if (!RECEIVER_PATTERN.test(receiver)) continue;
          // 얇은 위임 어댑터 — 이 메서드의 호출부가 같은 규칙으로 검사된다
          if (call.member && sinkMethods.has(call.member)) continue;
          if (isGuardedAt(call.member, call.start, 0, new Set())) continue;
          context.report({
            node: call.node,
            messageId: 'unchecked',
            data: { receiver, method: call.name },
          });
        }
      },
    };
  },
};

/** flat config 인라인 플러그인 — 규칙 접두사는 `onyu-discord`. */
export const onyuDiscordPlugin = {
  meta: { name: 'onyu-discord' },
  rules: {
    'guild-channel-send-requires-ownership-check': guildChannelSendRequiresOwnershipCheck,
  },
};

export const ONYU_DISCORD_PLUGIN_NAME = 'onyu-discord';
