# Plan: Annotate PR Diffs with Line Numbers

## Context
The AI reviewer receives raw unified diffs with no line numbers. It must count lines from hunk headers (`@@ +newStart,newLines @@`) to determine line numbers, but LLMs are unreliable at counting — causing line/content mismatches in review comments (off by 3–15 lines in real examples). The fix: prepend new-file line numbers to each diff line so the AI reads the number directly.

## Target format
```
  25 │  import { SelectOptions } from '...';
     │ -import { useCurrencyConfigStore } from '...';
     │ -import { useMarketDataStore } from '...';
  28 │ +import { useMarketStore } from '...';
  29 │  import { useWindowFocus, watchDebounced } from '@vueuse/core';
```
- `+` and ` ` lines → new-file line number
- `-` lines → blank padding (no number, they don't exist in the new file)
- Headers, hunk markers, metadata → pass through unchanged

## Implementation Steps

### Step 1: Add `annotateDiffWithLineNumbers()` to `src/utils/diff-parser.ts`

New exported function at end of file. Two-pass approach:
1. **Pass 1:** Scan hunk headers to find max line number → compute padding width (`Math.max(4, digits)`)
2. **Pass 2:** Walk each line:
   - File/hunk headers, metadata (`diff --git`, `@@`, `---`, `+++`, `index`, `new file mode`, etc.) → push unchanged
   - On hunk header → parse `newStart`, set `currentLineNum`
   - `-` line → push with blank padding, no increment
   - `+` or ` ` line → push with `lineNum │ `, increment
   - `\` (no newline marker) → push unchanged

Uses `│` (U+2502) separator to match existing `code-display.ts` convention.

### Step 2: Call annotation in `src/core/review-prompt.ts`

In `buildPRContextSection()`, annotate diff before embedding:
```typescript
const annotatedDiff = annotateDiffWithLineNumbers(prDetails.diff);
```
Then embed `annotatedDiff` instead of `prDetails.diff` in the code fence.

**Important:** `prDetails.diff` itself stays untouched — `parseDiff()` in `reviewer.ts` still receives the raw diff for structured parsing and `validateTargetCodes()`.

### Step 3: Update prompt wording in `src/core/review-prompt.ts`

**`buildDiffRulesSection()`** — Update the line-number explanation to reflect that numbers are now visible:
```
Each '+' and ' ' (context) line is prefixed with its new-file line number.
'-' (deleted) lines show no line number — they are removed code.
Use ONLY the line numbers shown next to '+' lines for your comments.
```

No changes needed to `buildExamplesSection()` — examples already use the `98 │ +  [code]` format.

### Step 4: Update verbose logging in `src/core/reviewer.ts`

Change the recently added raw diff log from `prompt` category to `diff` category:
```typescript
logger.log('diff', 'Raw PR diff:\n' + prDetails.diff);
```
The annotated version is what the AI sees, so it belongs under `prompt` — add that log inside `buildPRContextSection()` after annotation.

## Files Modified
1. **`src/utils/diff-parser.ts`** — add `annotateDiffWithLineNumbers()`
2. **`src/core/review-prompt.ts`** — call annotation in `buildPRContextSection()`, update `buildDiffRulesSection()` wording, add import
3. **`src/core/reviewer.ts`** — change log category from `prompt` to `diff`

## Verification
1. `npm run build` — confirm no type errors
2. `ai-review pr --verbose=prompt,diff` on a real PR — check that:
   - `[DIFF]` log shows raw diff (no numbers)
   - `[PROMPT]` log shows annotated diff with correct line numbers
   - AI response line numbers match the annotated numbers
   - `validateTargetCodes()` still works (it uses raw parsed diff, unaffected)
