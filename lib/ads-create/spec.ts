// Pure, dependency-free spec logic for campaign creation. No network, no Node APIs.

export type Objective =
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_AWARENESS";

export const OBJECTIVES: { value: Objective; label: string }[] = [
  { value: "OUTCOME_LEADS", label: "Leads" },
  { value: "OUTCOME_SALES", label: "Sales" },
  { value: "OUTCOME_TRAFFIC", label: "Traffic" },
  { value: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { value: "OUTCOME_AWARENESS", label: "Awareness" },
];

// Optimization goals valid for each objective (subset of Meta's enum that the UI exposes).
const GOALS: Record<Objective, string[]> = {
  OUTCOME_LEADS: ["LEAD_GENERATION", "OFFSITE_CONVERSIONS", "QUALITY_LEAD"],
  OUTCOME_SALES: ["OFFSITE_CONVERSIONS", "VALUE"],
  OUTCOME_TRAFFIC: ["LINK_CLICKS", "LANDING_PAGE_VIEWS"],
  OUTCOME_ENGAGEMENT: ["POST_ENGAGEMENT", "PAGE_LIKES", "THRUPLAY"],
  OUTCOME_AWARENESS: ["REACH", "AD_RECALL_LIFT", "IMPRESSIONS"],
};

export function optimizationGoalsFor(objective: Objective): string[] {
  return GOALS[objective] ?? [];
}

// Billing event valid for a given optimization goal. Meta requires the pair to be compatible.
const BILLING: Record<string, string> = {
  LINK_CLICKS: "LINK_CLICKS",
  LANDING_PAGE_VIEWS: "IMPRESSIONS",
  OFFSITE_CONVERSIONS: "IMPRESSIONS",
  VALUE: "IMPRESSIONS",
  LEAD_GENERATION: "IMPRESSIONS",
  QUALITY_LEAD: "IMPRESSIONS",
  POST_ENGAGEMENT: "IMPRESSIONS",
  PAGE_LIKES: "IMPRESSIONS",
  THRUPLAY: "IMPRESSIONS",
  REACH: "IMPRESSIONS",
  AD_RECALL_LIFT: "IMPRESSIONS",
  IMPRESSIONS: "IMPRESSIONS",
};

export function billingEventFor(optimizationGoal: string): string {
  return BILLING[optimizationGoal] ?? "IMPRESSIONS";
}

// Per-currency daily budget minimums in MAJOR units (approximate Meta floors; conservative).
const BUDGET_FLOOR_MAJOR: Record<string, number> = {
  USD: 1, EUR: 1, GBP: 1, THB: 40, JPY: 100, AUD: 1, SGD: 1,
};

export function validateBudgetFloor(amountMajor: number, currency: string): string | null {
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) return "Enter a budget greater than 0.";
  const floor = BUDGET_FLOOR_MAJOR[currency] ?? 1;
  if (amountMajor < floor) return `Daily budget must be at least ${floor} ${currency}.`;
  return null;
}

type FbError = { error_user_msg?: string; error_user_title?: string; message?: string };
type WithFbError = { fbError?: FbError };

// Map a thrown Graph error to a human message. fb.ts attaches the raw error object as `.fbError`.
export function normalizeFbError(err: unknown): { message: string; hint?: string } {
  const fb = (err as WithFbError)?.fbError;
  if (fb) {
    const msg = fb.error_user_msg || fb.message || "Facebook rejected the request.";
    const hint = fb.error_user_title || undefined;
    return { message: String(msg), hint };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}
