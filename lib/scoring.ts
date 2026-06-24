export type Direction = "higher" | "lower";

export interface Criterion {
  key: string;
  direction: Direction;
  good: number;
  bad: number;
}

export type Score = "ดี" | "ปานกลาง" | "ไม่ดี" | null;

export function scoreAd(row: Record<string, unknown>, criteria: Criterion[]): Score {
  if (!criteria.length) return null;
  if (!Number(row.spend)) return null;

  let total = 0;
  for (const c of criteria) {
    const v = Number(row[c.key] ?? 0);
    if (c.direction === "higher") {
      total += v >= c.good ? 2 : v >= c.bad ? 1 : 0;
    } else {
      total += v <= c.good ? 2 : v <= c.bad ? 1 : 0;
    }
  }
  const ratio = total / (criteria.length * 2);
  return ratio >= 0.67 ? "ดี" : ratio >= 0.34 ? "ปานกลาง" : "ไม่ดี";
}
