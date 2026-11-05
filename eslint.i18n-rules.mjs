/**
 * 로케일 tier 재유입 방지 로컬 ESLint 플러그인 (F-GENERAL-007 · docs/plans/i18n-locale-tiering-generalization.md §3 S6).
 *
 * - R1 no-locale-literal-branch : `x === 'ko'` / `? 'ko' : 'en'` 같은 로케일 리터럴 분기
 * - R2 no-locale-literal-set    : `'ko' | 'en'` 유니온 타입 / `['ko', 'en']` 배열 리터럴
 * - R3 locale-table-via-helper  : ko·en 키를 모두 가진 객체 리터럴이 `defineLocaleTable`/`pickLocale` 인자가 아닌 곳
 * - R4 no-hardcoded-hangul      : 사용자 노출 디렉터리의 하드코딩 한글 문자열
 *
 * 순수 JS(.mjs)라 shared 의 TS 상수를 import 할 수 없다 — 로케일 집합은 아래 상수에 중복 선언한다.
 * 2군 로케일이 늘면 `LOCALE_LITERALS` 에 추가한다(1군 ko/en 이 분기 금지의 핵심 대상).
 */

/** 분기·집합 리터럴로 쓰면 안 되는 로케일 코드. */
const LOCALE_LITERALS = new Set(['ko', 'en']);

/** 로케일 테이블을 만드는 헬퍼 — 이 호출의 인자 안에서는 ko/en 키·한글 리터럴이 허용된다. */
const LOCALE_TABLE_HELPERS = new Set(['defineLocaleTable', 'pickLocale']);

/** 1군 전용 테이블임을 알리는 타입 이름 — `Record<Tier1Locale, …>` 는 정당한 1군 테이블이다. */
const TIER1_TYPE_PATTERN = /\bTier1Locale\b/;

const HANGUL_PATTERN = /[ㄱ-ㆎ가-힣]/;

const LOGGER_METHODS = new Set(['log', 'debug', 'verbose', 'warn', 'error', 'fatal']);

const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);

/** @param {import('estree').Node | undefined | null} node */
function isLocaleStringLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' && LOCALE_LITERALS.has(node.value);
}

/** 객체 프로퍼티 키 이름(Identifier / 문자열 Literal) — 계산 키·스프레드는 null. */
function getPropertyKeyName(property) {
  if (property.type !== 'Property' || property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return String(property.key.value);
  return null;
}

function getCalleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    return callee.property.name;
  }
  return null;
}

/** `defineLocaleTable(...)` / `pickLocale(...)` 호출의 인자(직접 자식)인가. */
function isDirectHelperArgument(node) {
  const parent = node.parent;
  return (
    parent?.type === 'CallExpression' &&
    parent.arguments.includes(node) &&
    LOCALE_TABLE_HELPERS.has(getCalleeName(parent.callee))
  );
}

/** 조상 중 로케일 테이블 헬퍼 호출이 있는가(인자 내부 깊은 곳 포함). */
function isInsideHelperCall(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'CallExpression' && LOCALE_TABLE_HELPERS.has(getCalleeName(current.callee))) {
      return true;
    }
  }
  return false;
}

/** logger.xxx(...) · console.xxx(...) 호출인가. */
function isLoggerCall(callExpression) {
  const callee = callExpression.callee;
  if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') {
    return false;
  }
  if (!LOGGER_METHODS.has(callee.property.name)) return false;
  const objectText = flattenMemberChain(callee.object);
  return /logger|console/i.test(objectText);
}

function flattenMemberChain(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return `${flattenMemberChain(node.object)}.${node.property.name}`;
  }
  return '';
}

/** `new XxxException(...)` / `new XxxError(...)` — 사용자 비노출 예외 메시지. */
function isExceptionConstruction(newExpression) {
  const callee = newExpression.callee;
  return callee.type === 'Identifier' && /(Exception|Error)$/.test(callee.name);
}

/** 조상 사슬에서 R4 제외 문맥(로거·예외·로케일 테이블 헬퍼·`ko:` 키 값)을 찾는다. */
function isInR4ExemptContext(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'CallExpression') {
      if (LOCALE_TABLE_HELPERS.has(getCalleeName(current.callee)) || isLoggerCall(current)) return true;
    }
    if (current.type === 'NewExpression' && isExceptionConstruction(current)) return true;
    // 로케일 테이블의 `ko:` 값은 번역 원문이다 — 한글이 정상.
    if (current.type === 'Property' && getPropertyKeyName(current) === 'ko') return true;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const noLocaleLiteralBranch = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      comparison:
        "로케일 리터럴('{{value}}') 직접 비교 금지 — pickLocale / defineLocaleTable / isTier1Locale 등 tier 헬퍼를 사용하세요 (F-GENERAL-007).",
      ternary:
        "로케일 삼항(`? 'ko' : 'en'`) 금지 — pickLocale / defineLocaleTable 을 사용하세요 (F-GENERAL-007).",
      switchCase:
        "switch 의 로케일 리터럴 case('{{value}}') 금지 — pickLocale / defineLocaleTable / isTier1Locale 등 tier 헬퍼를 사용하세요 (F-GENERAL-007).",
    },
  },
  create(context) {
    return {
      // 이항 비교와 같은 기준 — discriminant 는 따지지 않고 case 리터럴만 본다(default 는 test 가 null).
      SwitchCase(node) {
        if (isLocaleStringLiteral(node.test)) {
          context.report({ node, messageId: 'switchCase', data: { value: node.test.value } });
        }
      },
      BinaryExpression(node) {
        if (!EQUALITY_OPERATORS.has(node.operator)) return;
        const literal = [node.left, node.right].find(isLocaleStringLiteral);
        if (literal) {
          context.report({ node, messageId: 'comparison', data: { value: literal.value } });
        }
      },
      ConditionalExpression(node) {
        if (isLocaleStringLiteral(node.consequent) && isLocaleStringLiteral(node.alternate)) {
          context.report({ node, messageId: 'ternary' });
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noLocaleLiteralSet = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      union:
        "`'ko' | 'en'` 리터럴 유니온 금지 — SupportedLocale / Tier1Locale 등 shared 타입을 사용하세요 (F-GENERAL-007).",
      array:
        "`['ko', 'en']` 로케일 배열 리터럴 금지 — SUPPORTED_LOCALES / TIER1_LOCALES 등 shared 상수를 사용하세요 (F-GENERAL-007).",
    },
  },
  create(context) {
    return {
      TSUnionType(node) {
        const localeMembers = node.types.filter(
          (member) => member.type === 'TSLiteralType' && isLocaleStringLiteral(member.literal),
        );
        const distinct = new Set(localeMembers.map((member) => member.literal.value));
        if (distinct.size >= LOCALE_LITERALS.size) {
          context.report({ node, messageId: 'union' });
        }
      },
      ArrayExpression(node) {
        const distinct = new Set(
          node.elements.filter(isLocaleStringLiteral).map((element) => element.value),
        );
        if (distinct.size >= LOCALE_LITERALS.size) {
          context.report({ node, messageId: 'array' });
        }
      },
    };
  },
};

/** `Record<Tier1Locale, …>` 주석 / `as`·`satisfies` 로 1군 전용임이 선언된 객체인가. */
function isDeclaredTier1Table(node, sourceCode) {
  let current = node;
  while (current.parent && ['TSAsExpression', 'TSSatisfiesExpression'].includes(current.parent.type)) {
    current = current.parent;
    if (TIER1_TYPE_PATTERN.test(sourceCode.getText(current.typeAnnotation))) return true;
  }
  const parent = current.parent;
  if (parent?.type === 'VariableDeclarator' && parent.init === current) {
    const annotation = parent.id.typeAnnotation;
    return annotation ? TIER1_TYPE_PATTERN.test(sourceCode.getText(annotation)) : false;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const localeTableViaHelper = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      table:
        'ko·en 키를 모두 가진 객체 리터럴은 defineLocaleTable / pickLocale 인자로 작성하세요 (2군 en 폴백 누락 방지, F-GENERAL-007). 1군 전용이면 `Record<Tier1Locale, …>` 로 타입을 명시하세요.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      ObjectExpression(node) {
        const keys = new Set(node.properties.map(getPropertyKeyName));
        const hasAllLocaleKeys = [...LOCALE_LITERALS].every((locale) => keys.has(locale));
        if (!hasAllLocaleKeys) return;
        if (isDirectHelperArgument(node) || isDeclaredTier1Table(node, sourceCode)) return;
        context.report({ node, messageId: 'table' });
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noHardcodedHangul = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      hangul:
        '사용자 노출 영역에 한글 문자열을 하드코딩하지 마세요 — i18n 키(@onyu/i18n) 또는 defineLocaleTable 을 사용하세요 (F-GENERAL-007).',
    },
  },
  create(context) {
    function check(node, text) {
      if (!HANGUL_PATTERN.test(text) || isInR4ExemptContext(node)) return;
      context.report({ node, messageId: 'hangul' });
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};

/** flat config 인라인 플러그인 — 규칙 접두사는 `onyu-i18n`. */
export const onyuI18nPlugin = {
  meta: { name: 'onyu-i18n' },
  rules: {
    'no-locale-literal-branch': noLocaleLiteralBranch,
    'no-locale-literal-set': noLocaleLiteralSet,
    'locale-table-via-helper': localeTableViaHelper,
    'no-hardcoded-hangul': noHardcodedHangul,
  },
};

export const ONYU_I18N_PLUGIN_NAME = 'onyu-i18n';
