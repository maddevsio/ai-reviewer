# Unit Testing Plan

## Framework: Vitest

**Why Vitest over Jest:**
- Works with TypeScript out of the box (no ts-jest, no babel config)
- Jest-compatible API (`describe`, `it`, `expect`, `vi.fn()`, `vi.spyOn()`)
- Significantly faster than Jest
- Supports ESM natively (relevant given the project uses modern TS)

**Dependencies to install:**
```
npm install --save-dev vitest @vitest/coverage-v8
```

**No tsconfig changes needed** — Vitest picks up the existing `tsconfig.json`.

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

---

## What Is NOT Tested (by design)

| Category | Reason |
|---|---|
| `src/providers/*.ts` `sendPrompt()` | Non-deterministic AI responses |
| `src/platforms/*.ts` API calls | Require live credentials / network |
| `src/commands/*.ts` | Orchestration code, heavy side effects |
| `reviewCommentsInteractively()` | Requires live `inquirer` TTY |
| `askPostCommentsDecision()` | Requires live `inquirer` TTY |
| `askPRApprovalDecision()` | Requires live `inquirer` TTY |
| `askStrictnessLevel()` | Requires live `inquirer` TTY |
| `getGitRemoteUrl()` | Requires actual git remote (`execSync`) |
| `findGitRepoRoot()` / `isInGitRepo()` | Filesystem-dependent, covered by integration |

---

## Directory Structure

```
tests/
  fixtures/
    sample-diff.ts        # Reusable diff strings used across multiple test files
  unit/
    diff-parser.test.ts
    review-prompt.test.ts
    review-workflow.test.ts
    strictness.test.ts
    date.test.ts
    config-utils.test.ts
    git.test.ts
    review-export.test.ts
    logger.test.ts
    constants.test.ts
vitest.config.ts
```

---

## Shared Fixtures (`tests/fixtures/sample-diff.ts`)

A reusable realistic diff string is needed by `diff-parser`, `review-prompt`, and `review-workflow` tests.

**Contents:**
- A two-file diff (e.g. `src/auth/login.ts` and `src/utils/helpers.ts`)
- Multiple hunks per file
- Mix of `+`, `-`, and ` ` lines
- Covers: added functions, removed lines, context lines, blank added lines (the tricky edge case)
- Specific known line numbers so test assertions can be hardcoded

Example structure:
```
diff --git a/src/auth/login.ts b/src/auth/login.ts
@@ -10,6 +10,12 @@   ← hunk 1: new file starts at line 10
 context line
 context line
+added line at 12
+added line at 13
-removed line
 context line
@@ -40,4 +46,8 @@   ← hunk 2: new file starts at line 46
 context line
+added line at 47
+
+added line at 49
 context line
diff --git a/src/utils/helpers.ts b/src/utils/helpers.ts
@@ -1,3 +1,5 @@   ← single hunk, new file starts at line 1
+added line at 1
 context line
+added line at 3
```

The fixture exports: `SAMPLE_DIFF`, `SAMPLE_DIFF_FILE1`, `SAMPLE_DIFF_FILE2`, and a pre-parsed `PARSED_SAMPLE_DIFF` (result of `parseDiff(SAMPLE_DIFF)`) for tests that need a Map directly.

---

## Test Files

---

### 1. `tests/unit/diff-parser.test.ts`

**Target:** `src/utils/diff-parser.ts`
All functions are pure — no mocking needed.

#### `parseDiff()`
- Parses single-file diff → Map with one entry, correct `newPath`, correct hunk count
- Parses two-file diff → Map with two entries
- Hunk fields: `newStart`, `newLines`, `oldStart`, `oldLines` match the `@@` header
- Hunk `lines` array: contains raw diff lines with `+`/`-`/` ` prefixes
- Handles `@@ -1,3 +1,5 @@` (with comma) and `@@ -1 +1 @@` (without comma, implied 1)
- Returns empty Map for empty string input
- File indexed by `newPath` (the `b/` side)

#### `isLineInDiff()`
- Returns `true` for a line within a hunk's new-file range
- Returns `false` for a line before the hunk
- Returns `false` for a line after the hunk ends
- Returns `false` for unknown file path
- Returns `false` for empty parsedFiles Map
- Boundary: exactly at `newStart` → `true`
- Boundary: exactly at `newStart + newLines` → `false` (exclusive end)

#### `getCodeAtLine()`
- Returns code content (stripped of `+`/` ` prefix) for a `+` line
- Returns code content for a ` ` (context) line
- Returns `null` for a `-` (deleted) line — deleted lines don't advance new-file counter
- Returns `null` for unknown file
- Returns `null` for line number not in any hunk
- Correctly skips deleted lines when counting new-file line numbers
- Returns the substring after the first character (the prefix)

#### `getContextWindow()`
- Returns context lines centered on target line (default 3 on each side)
- `startLineNum` is correct (matches first non-deleted line's new-file number)
- Returns `{ lines: [], startLineNum: 1 }` for unknown file
- Context window clipped at hunk boundary (doesn't include lines from other hunks)
- Includes adjacent `-` (deleted) lines within the window range
- With `contextLines=0`: returns only the exact target line
- Large context window that spans past end of hunk: clipped to hunk end

#### `getExactLineRange()`
- Returns exact lines `[startLine, endLine]` inclusive
- Does NOT add surrounding context lines
- `startLineNum` on result equals `startLine` parameter
- Returns empty result for unknown file
- Returns empty result when range is entirely outside all hunks
- Range partially overlapping a hunk: returns only the intersecting lines
- Single-line range (start === end): returns that one line

#### `getMultiRegionCodeContext()`
- Returns single region when there are no refRanges
- Drops ref region entirely contained within the main region
- Keeps ref region that is partially outside main region
- Sorts regions by `startLineNum` (ref before main when ref is earlier in file)
- Merges two overlapping regions of the **same** type (both isContext=true or both false)
- Does NOT merge adjacent regions of **different** types
- Merges adjacent (touching) same-type regions
- `isContext=false` on main region, `isContext=true` on ref regions
- Returns empty array when parsedFiles has no data for the file

#### `parseFileChanges()`
- Counts `additions` correctly (lines starting with `+`, excluding `+++`)
- Counts `deletions` correctly (lines starting with `-`, excluding `---`)
- `status` defaults to `'modified'`
- `status` = `'added'` when `new file mode` header present
- `status` = `'deleted'` when `deleted file mode` header present
- `status` = `'renamed'` when `rename from` header present
- `path` = `newPath` (the `b/` side)
- `patch` contains the full raw diff lines for that file
- Multi-file diff: returns one entry per file, additions/deletions counted per file

#### `annotateDiffWithLineNumbers()`
- `+` lines prefixed with right-aligned line number + ` │ `
- ` ` (context) lines prefixed with line number + ` │ `
- `-` (deleted) lines prefixed with blank padding (same width) + ` │ `
- `diff --git` header passes through unchanged, resets counter
- `@@` hunk header passes through unchanged, sets `currentLineNum`
- `---`, `+++`, `index `, `new file mode`, `deleted file mode` lines pass through
- `rename from`, `rename to`, `similarity index`, `Binary files` pass through
- Line number increments by 1 for each `+` or ` ` line (not for `-` lines)
- Pad width is at least 4, grows to accommodate max line number
- Empty string input → returns empty string unchanged

---

### 2. `tests/unit/review-prompt.test.ts`

**Target:** `src/core/review-prompt.ts`
`parseAIResponse` and `validateTargetCodes` are pure. `buildReview*` functions depend on `annotateDiffWithLineNumbers` and `getStrictnessInstructions` (also testable). Logger calls are side-effect-free for unit purposes (logger disabled by default).

#### `parseAIResponse()`

Single-line block:
- Parses `FILE`, `LINE`, `TARGET_CODE`, `REF_LINES`, `COMMENT` into a `ReviewComment`
- `line` is a number (not string)
- `startLine` is `undefined` when only `LINE:` present
- `targetCode` is captured correctly
- `refLines` parsed from `REF_LINES` field

Multi-line block:
- `startLine` from `START_LINE:`, `line` from `END_LINE:`
- `targetCode` from `TARGET_CODE_START:`
- `targetCodeEnd` from `TARGET_CODE_END:`

LGTM handling:
- Response is pure `"LGTM - No issues found."` → returns `[]`
- Response contains both `"LGTM"` AND `FILE:`/`COMMENT:` blocks → parses comments (does not short-circuit)
- Response contains `"No issues found"` with no blocks → returns `[]`

Multi-line COMMENT field:
- `COMMENT:` followed by continuation lines (no field prefix) → all appended with `\n`
- Final `comment` is trimmed

Multiple blocks (separated by `---`):
- Returns array with one entry per valid block
- Blocks missing required fields (`file`, `line`, or `comment`) → silently skipped

`REF_LINES` parsing (via `parseRefLines` exercised through `parseAIResponse`):
- `REF_LINES: 5-8` → `[[5, 8]]`
- `REF_LINES: 5-8, 45-47` → `[[5, 8], [45, 47]]`
- `REF_LINES: 12` → `[[12, 12]]`
- `REF_LINES:` (empty) → `[]`
- `REF_LINES: ` (whitespace only) → `[]`
- `refLines` property absent from comment when empty (the spread `...(refLines.length > 0 ? {...} : {})`)

#### `validateTargetCodes()`

Uses a controlled `parsedDiff` Map constructed from `parseDiff(SAMPLE_DIFF)`.

Single-line path:
- `targetCode` matches actual code at `line` exactly → comment returned unchanged
- `targetCode` matches via substring (actual includes expected) → unchanged
- `targetCode` mismatch, but match found at `line + 2` within ±5 → `line` corrected to `line + 2`
- `targetCode` mismatch, but match found at `line - 3` → `line` corrected to `line - 3`
- `targetCode` mismatch, no match within ±5 → comment returned unchanged (original line kept)
- `getCodeAtLine` returns `null` (line not in diff) → comment returned unchanged
- Comment has no `targetCode` → returned unchanged immediately

Multi-line path:
- `startLine` mismatch, match found nearby → `startLine` corrected, `line` untouched
- `line` (END_LINE) mismatch via `targetCodeEnd`, match found nearby → `line` corrected, `startLine` untouched
- Both match → comment unchanged
- No `targetCodeEnd` → only `startLine` validated
- Returns new object (spread), does not mutate input

`codeMatches()` (tested indirectly):
- `actual.trim() === expected.trim()` → match
- `actual.trim().includes(expected.trim())` → match (expected is substring)
- `expected.trim().includes(actual.trim())` → match (actual is substring)
- Completely different strings → no match

#### `buildReviewInstructions()`
- Returns a non-empty string
- Contains key section markers: `FILE:`, `LINE:`, `START_LINE:`, `END_LINE:`, `TARGET_CODE`, `REF_LINES:`, `COMMENT:`
- Contains diff rule text (spot check for `+` prefix language)

#### `buildReviewContent(prDetails, strictness, projectContext?)`
- Includes `prDetails.pr.title` in output
- Includes `prDetails.description` in output
- Includes strictness display name
- Includes annotated diff (verify by checking for `│` annotation character)
- When `projectContext` provided: includes the context text
- When `projectContext` absent: does not include "PROJECT-SPECIFIC CONTEXT" heading
- File list: each file's path, additions, deletions appears in output

#### `buildReviewPrompt()`
- Result contains content from both `buildReviewContent` and `buildReviewInstructions`
- The two sections are joined (check that both the PR title and `FILE:` format marker appear)

---

### 3. `tests/unit/review-workflow.test.ts`

**Target:** `src/utils/review-workflow.ts`

Only the non-interactive, pure helper logic is tested here. The interactive inquirer-driven functions are excluded.

#### `convertToGeneralComment()` (private — test via a thin test harness or by re-exporting for tests)

Since the function is not exported, two options:
- Export it with a `/* @internal */` comment (preferred — keeps the logic accessible for tests)
- Or verify its behavior indirectly through `reviewCommentsInteractively` with a mocked inquirer

If exported:
- Single-line comment (`line=42`, no `startLine`): `comment` prefixed with `[About line 42 - not modified in this PR]`
- Multi-line comment (`startLine=10`, `line=15`): prefixed with `[About lines 10-15 - not modified in this PR]`
- `line` and `startLine` set to `undefined` in returned comment (removed so platform posts as general)
- `file` preserved
- `originalCode` and `suggestedCode` preserved
- `refLines` and `targetCode` NOT copied (stripped, since it becomes a general comment)

#### `handlePRApprovalWorkflow()`

This function is pure control-flow over async callbacks — fully testable with `vi.fn()`.

- `decision.action === 'approve'` + confirmed: calls `callbacks.onApprove()`
- `decision.action === 'approve'` + NOT confirmed: calls nothing
- `decision.action === 'request_changes'` + confirmed: calls `callbacks.onRequestChanges(decision.reviewBody)`
- `decision.action === 'request_changes'` + NOT confirmed: calls nothing
- `decision.action === 'comment'`: calls `callbacks.onComment()` immediately (no confirmation)
- `decision.action === 'skip'`: calls `callbacks.onSkip()` immediately (no confirmation)

`askConfirmation` is called internally — mock it with `vi.mock('./prompts')` to return `true`/`false`.

---

### 4. `tests/unit/strictness.test.ts`

**Target:** `src/utils/strictness.ts`
All tested functions are pure lookups against `STRICTNESS_LEVELS` constant.

#### `getStrictnessDisplayName(level)`
- `'easy'` → includes "They're Too Young to Die" and "easy"
- `'normal'` → includes "Not Too Rough" and "normal"
- `'balanced'` → includes "Hurt Them Plenty" and "balanced"
- `'strict'` → includes "Ultra-Violence" and "strict"
- `'pedantic'` → includes "Watch Them Die" and "pedantic"

#### `getStrictnessInstructions(level)`
- All 5 levels return a non-empty string
- `'easy'` instructions mention "critical" (focus on critical only)
- `'pedantic'` instructions mention "EVERYTHING" (full coverage)
- `'balanced'` instructions mention "recommended"
- Each level's instructions differ from every other level's

#### `isValidStrictness(value)`
- `'easy'`, `'normal'`, `'balanced'`, `'strict'`, `'pedantic'` → `true`
- `'medium'`, `'high'`, `''`, `'EASY'` (wrong case) → `false`
- TypeScript type guard behavior: confirm return type narrows correctly (compile-time check)

---

### 5. `tests/unit/date.test.ts`

**Target:** `src/utils/date.ts`

`formatDistanceToNow` uses `new Date()` internally. Use `vi.useFakeTimers()` + `vi.setSystemTime()` to control "now".

Strategy: fix "now" to a known timestamp, then pass dates at specific offsets.

#### `formatDistanceToNow(date)`
- 30 seconds ago → `'just now'`
- 59 seconds ago → `'just now'`
- 1 minute ago → `'1 minute ago'` (singular)
- 2 minutes ago → `'2 minutes ago'` (plural)
- 59 minutes ago → `'59 minutes ago'`
- 1 hour ago → `'1 hour ago'` (singular)
- 2 hours ago → `'2 hours ago'` (plural)
- 23 hours ago → `'23 hours ago'`
- 1 day ago → `'1 day ago'` (singular)
- 2 days ago → `'2 days ago'` (plural)
- 29 days ago → `'29 days ago'`
- 30 days ago → `'1 month ago'` (first month threshold)
- 60 days ago → `'2 months ago'`

Restore real timers with `vi.useRealTimers()` in `afterEach`.

---

### 6. `tests/unit/config-utils.test.ts`

**Target:** `src/utils/config.ts`

#### `isSensitiveKey(key)`
- `'api-key'` → `true`
- `'bitbucket-api-token'` → `true`
- `'gitlab-token'` → `true`
- `'provider'` → `false`
- `'platform'` → `false`
- `'google-model'` → `false`
- `'groq-model'` → `false`
- `'review-strictness'` → `false`

#### `maskApiKey(key)`
- String of 10 chars or fewer → `'***'`
- String of exactly 10 chars → `'***'`
- String of exactly 11 chars → first 8 + `'...'` + last 4 (`'12345678...8901'`)
- String of 20 chars → first 8 + `'...'` + last 4
- Real-looking API key `'sk-ant-api01-xxxxxxxxxxxx'` → correct masking

#### `configCleanup()`
This function calls `getConfig()` and `deleteConfig()` which touch the filesystem/conf package.
Mock both with `vi.mock('../config/manager')` to return controlled values.

- When `target='provider'` and current provider is `'anthropic'`: deletes `'google-model'` (Google key) and `'groq-model'` (Groq key) if they exist in config
- When `target='provider'` and current provider is `'google'`: does NOT delete `'google-model'`, but deletes `'groq-model'`
- When `target='platform'` and current platform is `'github'`: deletes all `bitbucket-*` and `gitlab-*` keys that exist
- When `target='platform'` and current platform is `'bitbucket'`: deletes `gitlab-*` keys but not `bitbucket-*`
- When `target=undefined`: cleans both provider and platform keys
- Keys that don't exist in config (getConfig returns undefined) are not passed to deleteConfig

---

### 7. `tests/unit/git.test.ts`

**Target:** `src/utils/git.ts`
`parseBitbucketUrl` and `parseGitLabUrl` are pure regex functions — no mocking needed.

#### `parseBitbucketUrl(remoteUrl)`
- HTTPS with `.git`: `https://bitbucket.org/myworkspace/my-repo.git` → `{ workspace: 'myworkspace', repoSlug: 'my-repo' }`
- HTTPS without `.git`: `https://bitbucket.org/myworkspace/my-repo` → same result
- SSH with `.git`: `git@bitbucket.org:myworkspace/my-repo.git` → same result
- SSH without `.git`: `git@bitbucket.org:myworkspace/my-repo` → same result
- Non-Bitbucket URL (GitHub): returns `null`
- Empty string: returns `null`
- URL with `bitbucket.org` in a subdomain that isn't bitbucket (edge case): `null`
- Workspace and repoSlug with hyphens/underscores: parsed correctly

#### `parseGitLabUrl(remoteUrl)`
- HTTPS gitlab.com with `.git`: `https://gitlab.com/mygroup/my-project.git` → `{ namespace: 'mygroup', project: 'my-project' }`
- HTTPS gitlab.com without `.git`: same result
- SSH: `git@gitlab.com:mygroup/my-project.git` → same result
- Self-hosted HTTPS: `https://gitlab.example.com/mygroup/my-project.git` → same result
- Self-hosted SSH: `git@gitlab.example.com:mygroup/my-project.git` → same result
- Non-GitLab URL: returns `null`
- Empty string: returns `null`
- Namespace and project with hyphens/underscores/dots: parsed correctly

---

### 8. `tests/unit/review-export.test.ts`

**Target:** `src/utils/review-export.ts`

`generateReviewMarkdown` is private; `exportToReviewFile` is the exported entry point. Mock `fs.writeFileSync` with `vi.spyOn(fs, 'writeFileSync')` to capture what gets written without touching the disk.

#### `exportToReviewFile(comments, prId)`
Mock `fs.writeFileSync`. Capture the written content string.

- Markdown title contains `# Code Review - PR #${prId}`
- **Date** line contains today's ISO date (use `vi.useFakeTimers` to fix the date)
- **Total Comments** line reflects `comments.length`
- Single file with single comment: `## ${file}` heading, `### Line ${line}` subheading, comment text present
- Multi-line range comment (`startLine !== line`): `### Lines ${startLine}-${line}` subheading
- General comment (no `line`): `### General` subheading
- Multiple files: each file gets its own `## ${file}` section, in insertion order
- Multiple comments in same file: all appear under the same `## ${file}` section
- Horizontal rule (`---`) separator after each file section
- `fs.writeFileSync` called with path ending in `REVIEW.md`
- Write error: when `writeFileSync` throws, `exportToReviewFile` throws with message starting "Failed to write REVIEW.md:"

---

### 9. `tests/unit/logger.test.ts`

**Target:** `src/utils/logger.ts`

Use a fresh `Logger` instance per test (import the class, not the singleton, or reset it via `disable()`).

#### `Logger.enable()` / `isEnabled()` / `disable()`
- After `enable(['api'])`: `isEnabled('api')` → `true`, `isEnabled('config')` → `false`
- After `enable(['api-detailed'])`: both `isEnabled('api-detailed')` and `isEnabled('api')` → `true` (auto-enable)
- After `enable('all')`: all 6 categories → `true`
- After `enable(['api'])` then `disable()`: `isEnabled('api')` → `false`
- Fresh logger (no enable called): all `isEnabled()` → `false`
- `enable` can be called multiple times, accumulates: `enable(['api'])` then `enable(['config'])` → both enabled

#### `enableVerboseLogging(value)`
This function uses the singleton `logger`. Reset it via `logger.disable()` in `afterEach`.

- `enableVerboseLogging(true)` → `logger.isEnabled('api')` and all others → `true`
- `enableVerboseLogging('true')` → same as `true`
- `enableVerboseLogging('api,config')` → `isEnabled('api')` and `isEnabled('config')` → `true`, others → `false`
- `enableVerboseLogging('api-detailed')` → `isEnabled('api-detailed')` AND `isEnabled('api')` → `true`
- `enableVerboseLogging('invalid-category')` → nothing enabled (invalid filtered out), warning printed
- `enableVerboseLogging('api,invalid')` → only `'api'` enabled (invalid filtered), no warning since at least one valid

---

### 10. `tests/unit/constants.test.ts`

**Target:** `src/config/constants.ts` — specifically the `API_KEY_VALIDATION` validators.

#### `API_KEY_VALIDATION.anthropic.validate(key)`
- `'sk-ant-api01-xxxx'` → `true`
- `'sk-other-xxxx'` → returns error string (not `true`)
- `''` → error string
- `'sk-'` → error string (starts with `sk-` but not `sk-ant-`)
- Error string contains `"sk-ant-"`

#### `API_KEY_VALIDATION.google.validate(key)`
- `'AIzaSyXXXXXXXXXX'` → `true`
- `'sk-google-xxxx'` → error string
- `''` → error string
- Error string contains `"AIza"`

#### `API_KEY_VALIDATION.openai.validate(key)`
- `'sk-proj-xxxx'` → `true`
- `'sk-xxxx'` → `true` (starts with `sk-`)
- `'pk-xxxx'` → error string
- `''` → error string
- Error string contains `"sk-"`

#### `API_KEY_VALIDATION.groq.validate(key)`
- `'gsk_xxxxxxxxxxxx'` → `true`
- `'sk-groq-xxxx'` → error string
- `''` → error string
- Error string contains `"gsk_"`

---

## `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/commands/**',   // CLI orchestration, heavy side effects
        'src/platforms/**',  // Live API calls
        'src/providers/**',  // Non-deterministic AI
        'src/index.ts',      // Entry point boilerplate
        'src/cli.ts',        // Commander setup
      ],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
```

---

## Implementation Order

Ordered by purity (no mocking → some mocking):

1. **`constants.test.ts`** — pure validators, zero deps
2. **`date.test.ts`** — pure, only needs fake timers
3. **`strictness.test.ts`** — pure lookups
4. **`git.test.ts`** — pure regex parsing (parseBitbucketUrl, parseGitLabUrl only)
5. **`config-utils.test.ts`** — `isSensitiveKey`, `maskApiKey` are pure; `configCleanup` needs mocked manager
6. **`diff-parser.test.ts`** — pure, uses the shared diff fixture
7. **`review-prompt.test.ts`** — uses `parseDiff` output + logger calls (logger disabled by default, no-op)
8. **`logger.test.ts`** — tests state machine; mocks `console.log` where needed
9. **`review-export.test.ts`** — mocks `fs.writeFileSync`
10. **`review-workflow.test.ts`** — mocks `askConfirmation` from prompts module

---

## Notes on `convertToGeneralComment`

This private function is core logic worth unit testing. The cleanest approach: add `export` to the function with a `/* @internal */` JSDoc comment. This is a minimal, non-breaking change that unlocks direct testing. Alternative: test it indirectly via a mocked `reviewCommentsInteractively` (more complex setup, less readable tests).

Recommended: export it.

---

## Implementation Discoveries

Quirks found during test implementation that required test design adjustments. Documented here so future contributors understand why certain test cases are written the way they are.

### 1. `parseAIResponse` trims `TARGET_CODE` values

**Location:** `src/core/review-prompt.ts` — `parseAIResponse()`

**Behavior:** When extracting the `TARGET_CODE` field, the parser calls `.trim()` on the remainder after stripping the `TARGET_CODE:` prefix:

```
targetCode = l.replace('TARGET_CODE:', '').trim()
```

This means any leading or trailing whitespace in the AI's response is stripped before the value is stored on the `ReviewComment`. The AI may write `TARGET_CODE:   if (!user) return null;` (with leading spaces matching the source indentation), but the stored `targetCode` will be `if (!user) return null;` without any leading spaces.

**Why it matters for test design:** Tests asserting `comment.targetCode` must use the trimmed form, not the raw indented form as it appears in the diff. The test name explicitly calls this out: `"parses targetCode (parser trims leading/trailing whitespace)"`.

---

### 2. `codeMatches` blank-line quirk — blank diff lines always match

**Location:** `src/core/review-prompt.ts` — `codeMatches()` and `findNearbyMatch()`

**Behavior:** `codeMatches(actual, expected)` is defined as:

```typescript
actual.trim() === expected.trim()
  || actual.includes(expected)
  || expected.includes(actual)
```

The third branch — `expected.includes(actual)` — becomes vacuously true whenever `actual` is the empty string, because every string includes `''`. Blank lines in the diff (e.g., a `+` line with nothing after it) strip to `''`, so `actual.trim()` is `''`, and `expected.includes('')` is `true` regardless of what `expected` is.

**Concrete effect:** `findNearbyMatch` searches ±5 lines from a claimed line number. If any blank added line falls within that window, it will match *any* `targetCode` value — even a long, specific import string. This can cause `validateTargetCodes` to silently "correct" a line number to a blank line when no real correction was intended.

**Why it matters for test design:** The `validateTargetCodes` tests and the sample diff fixture were designed to keep blank lines out of the ±5-line windows of the lines used in "no nearby match" and "exact match" test cases. Where blank lines cannot be avoided (e.g., line 13 in the fixture), the test avoids triggering end-line validation entirely by omitting `targetCodeEnd`.

**Fixed:** A `if (!a || !e) return false` guard was added to `codeMatches` before the substring checks. Blank lines can no longer produce false matches.
