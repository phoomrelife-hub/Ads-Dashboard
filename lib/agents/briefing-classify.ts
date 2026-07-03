// Pure, dependency-free helpers for the Daily Briefing engine.
// Kept in a separate file so unit tests can import them without pulling in
// server-only modules (Supabase, FB API) through the main briefing.ts chain.

/** Minimum true-ROAS upside before an ad qualifies as a hidden_winner. */
export const TRUE_ROAS_UPSIDE_RATIO = 1.25;

/**
 * Classify an ad's true-metric signal as real_loser, hidden_winner, or null.
 *
 * real_loser:
 *   — realCustomers === 0 (spent real money, zero tracked sales), OR
 *   — FB ROAS looks decent (≥ 1.5) but TRUE ROAS is < 1 (reality is bad).
 *
 * hidden_winner:
 *   — TRUE ROAS ≥ FB ROAS × 1.25 with at least 1 tracked customer
 *     (FB under-reports this ad's real performance).
 *
 * Returns null when neither condition is met.
 */
export function classifyTrueMetric(
  fbRoas: number | null,
  trueRoas: number | null,
  realCustomers: number,
): 'real_loser' | 'hidden_winner' | null {
  const fb = fbRoas ?? 0;
  if (realCustomers === 0) return 'real_loser';
  if (trueRoas != null && trueRoas < 1 && fb >= 1.5) return 'real_loser';
  if (trueRoas != null && fb > 0 && trueRoas >= fb * TRUE_ROAS_UPSIDE_RATIO && realCustomers >= 1) return 'hidden_winner';
  return null;
}
