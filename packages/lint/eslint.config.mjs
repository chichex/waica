// ESLint flat config for the waica monorepo. It enforces .sdd/coding-policies.md:
// every MUST rule that names a lint gate runs at `error`, every SHOULD rule at
// `warn` under the committed ratchet (lint-baseline.json). README.md maps each
// policy line to the rule and severity below.
import js from '@eslint/js'
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const repoRoot = new URL('../../', import.meta.url).pathname

const SOURCE_TS = ['packages/*/src/**/*.{ts,tsx}', 'examples/*/src/**/*.ts']
const SCRIPTS = ['scripts/**/*.mjs']
// Test code: unit tests, their `test-*.ts` support modules (excluded from
// builds), and the two scripted harnesses behind `pnpm test:e2e` and
// `pnpm test:dist` (Ajustes: size and complexity are warn-only in tests).
const TESTS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/test-*.ts',
  'scripts/runtime-e2e.mjs',
  'scripts/test-*.mjs',
]
const EDITOR = ['packages/editor/src/**/*.{ts,tsx}']
const EDITOR_JSX = ['packages/editor/src/**/*.tsx']

const COUNT = { skipBlankLines: true, skipComments: true }

// MUST rules whose existing violations are fixed by a later phase of the
// compliance run. Until that phase lands they run at warn under the ratchet;
// the phase that fixes them removes them from this set.
const PENDING_MUST = new Set([
  'max-lines-per-function',
  'max-lines',
  'react-hooks/exhaustive-deps',
  'react-hooks/immutability',
  'react-hooks/refs',
  'react-hooks/set-state-in-effect',
  'jsx-a11y/click-events-have-key-events',
  'jsx-a11y/no-static-element-interactions',
  'jsx-a11y/no-autofocus',
  'jsx-a11y/label-has-associated-control',
])

/** Severity for a rule a MUST policy line names. */
function must(rule) {
  return PENDING_MUST.has(rule) ? 'warn' : 'error'
}

// ESLint allows one severity per rule id, but the policies use two tiers for
// the same measure (MUST at 60/600, SHOULD at 40/300). The SHOULD tier reuses
// the core rule under a local name.
const waica = {
  meta: { name: 'waica' },
  rules: {
    'soft-max-lines-per-function': builtinRules.get('max-lines-per-function'),
    'soft-max-lines': builtinRules.get('max-lines'),
  },
}

/** Size and shape rules: MUST tier at error, SHOULD tier at warn. */
const sizeRules = {
  'max-lines-per-function': [must('max-lines-per-function'), { max: 60, ...COUNT }],
  'max-lines': [must('max-lines'), { max: 600, ...COUNT }],
  'waica/soft-max-lines-per-function': ['warn', { max: 40, ...COUNT }],
  'waica/soft-max-lines': ['warn', { max: 300, ...COUNT }],
  complexity: ['warn', { max: 10 }],
  'max-depth': ['warn', { max: 3 }],
  'max-params': ['warn', { max: 3 }],
}

/** The same measures, warn-only in test code. */
const testSizeRules = Object.fromEntries(
  Object.entries(sizeRules).map(([rule, [, options]]) => [rule, ['warn', options]]),
)

/**
 * Preset rules that no policy line names are adopted through L138 (a SHOULD):
 * they run at warn under the ratchet. Rules a MUST line names are set again
 * explicitly below.
 */
function asWarnings(configs) {
  return configs.map((config) =>
    config.rules
      ? {
          ...config,
          rules: Object.fromEntries(
            Object.entries(config.rules).map(([rule, entry]) => [rule, downgrade(entry)]),
          ),
        }
      : config,
  )
}

function downgrade(entry) {
  const [severity, ...options] = Array.isArray(entry) ? entry : [entry]
  const raised = severity === 'error' || severity === 2
  return raised ? ['warn', ...options] : [severity, ...options]
}

/**
 * A preset a MUST line adopts wholesale: its errors take the MUST severity,
 * its warnings and disabled rules stay as the preset ships them.
 */
function asMust(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([rule, entry]) => {
      const [severity, ...options] = Array.isArray(entry) ? entry : [entry]
      const raised = severity === 'error' || severity === 2
      return [rule, raised ? [must(rule), ...options] : [severity, ...options]]
    }),
  )
}

const typeScriptMustRules = {
  // TypeScript already reports undefined identifiers with full type info.
  'no-undef': 'off',
  '@typescript-eslint/no-non-null-assertion': must('@typescript-eslint/no-non-null-assertion'),
  '@typescript-eslint/no-explicit-any': must('@typescript-eslint/no-explicit-any'),
  '@typescript-eslint/no-unsafe-assignment': must('@typescript-eslint/no-unsafe-assignment'),
  '@typescript-eslint/no-unsafe-argument': must('@typescript-eslint/no-unsafe-argument'),
  '@typescript-eslint/no-unsafe-call': must('@typescript-eslint/no-unsafe-call'),
  '@typescript-eslint/no-unsafe-member-access': must('@typescript-eslint/no-unsafe-member-access'),
  '@typescript-eslint/no-unsafe-return': must('@typescript-eslint/no-unsafe-return'),
  '@typescript-eslint/switch-exhaustiveness-check': [
    must('@typescript-eslint/switch-exhaustiveness-check'),
    { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: false },
  ],
  '@typescript-eslint/no-unnecessary-type-parameters': must(
    '@typescript-eslint/no-unnecessary-type-parameters',
  ),
  '@typescript-eslint/unified-signatures': 'warn',
  '@typescript-eslint/no-floating-promises': [
    must('@typescript-eslint/no-floating-promises'),
    { ignoreVoid: false },
  ],
  '@typescript-eslint/no-misused-promises': must('@typescript-eslint/no-misused-promises'),
  '@typescript-eslint/consistent-type-imports': 'warn',
  '@typescript-eslint/ban-ts-comment': [
    must('@typescript-eslint/ban-ts-comment'),
    { 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 },
  ],
}

const doubleAssertion = {
  selector:
    "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
  message:
    'A double assertion through `unknown` hides an unchecked cast: narrow the value, or use a named helper whose single cast is commented.',
}

const uncheckedJsonParse = {
  selector:
    "TSAsExpression[typeAnnotation.type!='TSUnknownKeyword'][expression.type='CallExpression'][expression.callee.object.name='JSON'][expression.callee.property.name='parse']",
  message:
    'JSON.parse returns unchecked data: type it as unknown and narrow it with a guard before use.',
}

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', '**/.vite/**'] },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { waica },
  },
  comments.recommended,
  {
    rules: {
      // L64: every suppression states its reason after `--`.
      '@eslint-community/eslint-comments/require-description': 'error',
    },
  },
  {
    files: SCRIPTS,
    extends: asWarnings([js.configs.recommended]),
    languageOptions: { globals: { ...globals.node } },
    rules: { ...sizeRules },
  },
  {
    files: SOURCE_TS,
    extends: asWarnings([js.configs.recommended, ...tseslint.configs.recommendedTypeChecked]),
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: repoRoot },
      globals: { ...globals.browser },
    },
    rules: {
      ...sizeRules,
      ...typeScriptMustRules,
      'no-restricted-syntax': [must('no-restricted-syntax'), doubleAssertion, uncheckedJsonParse],
    },
  },
  {
    files: EDITOR,
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...asMust(reactHooks.configs.flat['recommended-latest'].rules),
      // L203 names exhaustive-deps, which the preset ships at warn.
      'react-hooks/exhaustive-deps': must('react-hooks/exhaustive-deps'),
    },
  },
  {
    files: EDITOR_JSX,
    plugins: { 'jsx-a11y': jsxA11y },
    languageOptions: jsxA11y.flatConfigs.recommended.languageOptions,
    rules: asMust(jsxA11y.flatConfigs.recommended.rules),
  },
  {
    files: TESTS,
    rules: {
      ...testSizeRules,
      // Test doubles may pass through `unknown`; CA-19 covers non-test source.
      'no-restricted-syntax': 'off',
    },
  },
)
