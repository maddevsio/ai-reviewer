/**
 * Reusable unified diff fixture used across unit tests.
 * Defined as an array of explicit strings then joined, so each line's
 * prefix character is unambiguous (no trailing-space surprises).
 *
 * FILE1: src/auth/login.ts  — two hunks
 *   Hunk 1: @@ -8,8 +8,12 @@   newStart=8, newLines=12  (new lines 8–19)
 *     line  8:  import { hash } from 'bcrypt';                        (context)
 *     line  9:  import { db } from '../db';                           (context)
 *     line 10: +import { logger } from '../utils/logger';             (added)
 *     line 11: +import { validateInput } from '../utils/validate';    (added)
 *     line 12: +import { RateLimiter } from '../utils/rate-limiter';  (added)
 *     line 13: +<empty>                                               (added, blank)
 *     line 14:  export async function login(...)                      (context)
 *     line 15:    const user = ...                                    (context)
 *              -  if (!user) return null;                             (removed — no new-file line)
 *     line 16: +  if (!user || !user.isActive) return null;           (added)
 *     line 17:    const valid = ...                                   (context)
 *     line 18:    return valid ? user : null;                         (context)
 *     line 19:  }                                                     (context)
 *
 *   Hunk 2: @@ -30,5 +36,8 @@  newStart=36, newLines=8  (new lines 36–43)
 *     line 36:  export async function resetPassword(...)              (context)
 *     line 37:    const user = ...                                    (context)
 *     line 38:    if (!user) throw ...                                (context)
 *              -  const oldToken = null;                              (removed)
 *     line 39: +  const token = generateResetToken();                 (added)
 *     line 40: +  await db.tokens.insert(...);                        (added)
 *     line 41: +  await sendResetEmail(user.email, token);            (added)
 *     line 42: +<empty>                                               (added, blank)
 *     line 43:  }                                                     (context)
 *
 * FILE2: src/utils/helpers.ts  — one hunk
 *   Hunk 1: @@ -1,3 +1,7 @@   newStart=1, newLines=7  (new lines 1–7)
 *     line  1: +export function formatDate(date: Date): string {      (added)
 *     line  2: +  return date.toISOString().split('T')[0];            (added)
 *     line  3: +}                                                     (added)
 *     line  4: +<empty>                                               (added, blank)
 *     line  5:  export function capitalize(str: string): string {     (context)
 *     line  6:    return str.charAt(0).toUpperCase() + str.slice(1);  (context)
 *     line  7:  }                                                     (context)
 */

export const FILE1 = 'src/auth/login.ts';
export const FILE2 = 'src/utils/helpers.ts';

export const SAMPLE_DIFF = [
  // FILE1 header
  'diff --git a/src/auth/login.ts b/src/auth/login.ts',
  'index abc123..def456 100644',
  '--- a/src/auth/login.ts',
  '+++ b/src/auth/login.ts',
  // Hunk 1: old starts at 8 with 8 lines, new starts at 8 with 12 lines
  "@@ -8,8 +8,12 @@ import { User } from './types';",
  " import { hash } from 'bcrypt';",                                         // new: 8  (context)
  " import { db } from '../db';",                                            // new: 9  (context)
  "+import { logger } from '../utils/logger';",                              // new: 10 (added)
  "+import { validateInput } from '../utils/validate';",                     // new: 11 (added)
  "+import { RateLimiter } from '../utils/rate-limiter';",                   // new: 12 (added)
  '+',                                                                        // new: 13 (added, blank)
  ' export async function login(username: string, password: string): Promise<User | null> {', // new: 14 (context)
  '   const user = await db.users.findOne({ username });',                   // new: 15 (context)
  '-  if (!user) return null;',                                              //          (removed)
  '+  if (!user || !user.isActive) return null;',                            // new: 16 (added)
  '   const valid = await bcrypt.compare(password, user.passwordHash);',    // new: 17 (context)
  '   return valid ? user : null;',                                          // new: 18 (context)
  ' }',                                                                       // new: 19 (context)
  // Hunk 2: old starts at 30 with 5 lines, new starts at 36 with 8 lines
  '@@ -30,5 +36,8 @@',
  ' export async function resetPassword(email: string): Promise<void> {',   // new: 36 (context)
  "   const user = await db.users.findOne({ email });",                      // new: 37 (context)
  "   if (!user) throw new Error('User not found');",                        // new: 38 (context)
  '-  const oldToken = null;',                                               //          (removed)
  '+  const token = generateResetToken();',                                  // new: 39 (added)
  '+  await db.tokens.insert({ userId: user.id, token, expiresAt: Date.now() + 3600000 });', // new: 40 (added)
  '+  await sendResetEmail(user.email, token);',                             // new: 41 (added)
  '+',                                                                        // new: 42 (added, blank)
  ' }',                                                                       // new: 43 (context)
  // FILE2 header
  'diff --git a/src/utils/helpers.ts b/src/utils/helpers.ts',
  'index 111222..333444 100644',
  '--- a/src/utils/helpers.ts',
  '+++ b/src/utils/helpers.ts',
  // Hunk 1: old starts at 1 with 3 lines, new starts at 1 with 7 lines
  '@@ -1,3 +1,7 @@',
  '+export function formatDate(date: Date): string {',                        // new: 1 (added)
  "+  return date.toISOString().split('T')[0];",                             // new: 2 (added)
  '+}',                                                                       // new: 3 (added)
  '+',                                                                        // new: 4 (added, blank)
  ' export function capitalize(str: string): string {',                      // new: 5 (context)
  '   return str.charAt(0).toUpperCase() + str.slice(1);',                  // new: 6 (context)
  ' }',                                                                       // new: 7 (context)
].join('\n');
