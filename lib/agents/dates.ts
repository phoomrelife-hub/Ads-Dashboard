// Date-range math shared by the agent tools (period-over-period compare) and the
// daily briefing engine. All ranges are UTC YYYY-MM-DD strings the FB API accepts.

export const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

export interface DateRange { since: string; until: string }

// Resolve a current window and the immediately-preceding equal-length window.
// Supports last_Nd, today, yesterday, this_month, last_month, or explicit since/until.
export function resolveCompareRanges(
  preset: string,
  since?: string,
  until?: string,
): { cur: DateRange; prev: DateRange } {
  let curS: Date, curU: Date;

  if (since && until) {
    curS = new Date(since + "T00:00:00Z");
    curU = new Date(until + "T00:00:00Z");
  } else {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (preset === "today") { curS = today; curU = today; }
    else if (preset === "yesterday") { curU = addDays(today, -1); curS = curU; }
    else if (preset === "this_month") { curS = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)); curU = today; }
    else if (preset === "last_month") {
      curS = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      curU = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)); // last day of prev month
    } else {
      const m = /^last_(\d+)d$/.exec(preset);
      const n = m ? Number(m[1]) : 7;
      curU = addDays(today, -1);            // complete days only (end yesterday)
      curS = addDays(curU, -(n - 1));
    }
  }

  const len = Math.round((curU.getTime() - curS.getTime()) / 86400000) + 1;
  const prevU = addDays(curS, -1);
  const prevS = addDays(prevU, -(len - 1));
  return {
    cur: { since: fmtDate(curS), until: fmtDate(curU) },
    prev: { since: fmtDate(prevS), until: fmtDate(prevU) },
  };
}
