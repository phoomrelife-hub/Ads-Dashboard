// Shared types for the Pixel Agents feature.

export type Provider = "anthropic" | "openai";

export type AgentStatus = "idle" | "walking" | "thinking" | "acting";

export interface AgentScope {
  /** ad account this agent is allowed to read/act on, e.g. "act_123456" */
  accountId: string;
}

export interface Agent {
  id: string;
  name: string;
  /** sprite variant index (procedural character look) */
  spriteId: number;
  /** hex colour used to tint the sprite + UI accents */
  color: string;
  provider: Provider;
  model: string;
  /** Stored server-side only. Never serialised to the client (redacted in API responses). */
  apiKey: string;
  systemPrompt: string;
  scope: AgentScope;
  /** desk this agent is assigned to (id from office.furniture) */
  deskId: string | null;
  /** tile position (grid coords) */
  pos: { x: number; y: number };
  createdAt: number;
}

/** Agent as returned to the client — apiKey is redacted. */
export type PublicAgent = Omit<Agent, "apiKey"> & { hasKey: boolean };

export type TileType = 0 | 1 | 2; // 0 floor, 1 wall, 2 carpet

export type FurnitureType = "desk" | "plant" | "coffee" | "cooler" | "rug";

export interface Furniture {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  /** direction the desk faces; the agent sits on the tile in front (desks only) */
  facing: "up" | "down" | "left" | "right";
}

export interface Office {
  cols: number;
  rows: number;
  /** row-major grid of tile types, length === cols*rows */
  tiles: TileType[];
  furniture: Furniture[];
}

export type LogKind = "task" | "response" | "proposal" | "action" | "error" | "rule";

// ── Automation rules (cron) ──────────────────────────────────────────────────
export type RuleMetric =
  | "roas" | "spend" | "cpl" | "cpc" | "ctr" | "leads" | "purchases" | "messaging" | "frequency" | "cpm";
export type RuleOp = ">" | ">=" | "<" | "<=" | "==";
export type RuleActionType = "pause" | "activate" | "set_budget";
export type RuleLevel = "campaign" | "adset" | "ad";

export interface RuleSchedule {
  kind: "daily" | "interval";
  time?: string;          // "HH:MM" (24h) for daily
  everyMinutes?: number;  // for interval
}
export interface RuleCondition {
  metric: RuleMetric;
  op: RuleOp;
  value: number;
}
export interface Rule {
  id: string;
  accountId: string;             // target ad account (act_...) or "all" — no agent needed
  agentId?: string;              // only required for the optional AI instruction
  name: string;
  enabled: boolean;
  dryRun: boolean;
  level: RuleLevel;
  datePreset: string;            // metric window, e.g. "today", "last_7d"
  condition?: RuleCondition;     // structured trigger (optional)
  instruction?: string;          // natural-language trigger run by the agent (optional)
  action: { type: RuleActionType; dailyBudget?: number };
  schedule: RuleSchedule;
  lastRunAt?: number;
  lastResult?: string;
  createdAt: number;
}

export interface LogEntry {
  id: string;
  agentId: string;
  ts: number;
  kind: LogKind;
  text: string;
}

// One entity touched during a rule run (or a note when nothing matched).
export interface RuleRunItem {
  entityId?: string;
  entityName: string;
  level?: RuleLevel;
  metric?: string;
  value?: number;
  action: string;                                   // "Paused", "Set budget ฿500", proposal tool, …
  status: "applied" | "dry-run" | "error" | "info";
  note?: string;
}
// One execution of a rule.
export interface RuleRun {
  id: string;
  ruleId: string;
  ts: number;
  dryRun: boolean;
  account: string;                                  // target account or "all"
  trigger: "schedule" | "manual";
  summary: string;
  items: RuleRunItem[];
}

export interface AgentsStore {
  agents: Agent[];
  office: Office;
  logs: LogEntry[];
  rules: Rule[];
  ruleRuns: RuleRun[];
  sessions: Session[];
}

// A persisted, resumable conversation thread between the user and one agent.
// The stored messages ARE the agent's per-session memory — replayed on resume.
export interface Session {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];   // user/assistant text turns only (proposals are transient)
}

// Lightweight session shape for the profile list (no full message bodies).
export interface SessionSummary {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

// ── Chat / tool-calling wire types ──────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  /** for role:"tool" — which tool call this result answers */
  toolCallId?: string;
  /** name of the tool (for tool results / assistant tool calls) */
  toolName?: string;
}

/** A read the agent performed to answer — surfaced to the user as a "Source". */
export interface ToolSource {
  id: string;
  tool: string;                 // "list_accounts" | "get_insights"
  args: Record<string, unknown>;
  result: unknown;              // the (trimmed) data the agent received
}

/** A write action the model wants to take — surfaced to the user for confirmation. */
export interface ProposedAction {
  id: string;
  tool: "set_status" | "set_budget" | "navigate";
  args: Record<string, unknown>;
  /** human-readable summary the model wrote, shown on the confirm card */
  summary: string;
}

export interface ChatResponse {
  /** assistant text to display */
  text: string;
  /** write actions awaiting user confirmation (may be empty) */
  proposals: ProposedAction[];
  /** full updated transcript to send back on the next turn */
  messages: ChatMessage[];
}

// ── Daily Briefing (Tier 2) ──────────────────────────────────────────────────
// Deterministic morning digest: ranked, evidence-backed items needing attention,
// each carrying an optional one-click action. No LLM — numbers are never invented.

export type BriefingKind = "wasting" | "declining" | "underperforming" | "fatigue" | "scaling";
export type BriefingSeverity = "critical" | "warning" | "opportunity" | "info";

/** One number shown on a briefing card (delta is % change vs previous period). */
export interface BriefingMetric {
  label: string;
  value: string;
  delta?: number | null;
  /** for delta colouring: is "up" good? (e.g. up is good for ROAS, bad for CPL) */
  upIsGood?: boolean;
}

/** A pre-built, account-scoped action the user can apply with one click. */
export interface BriefingProposal {
  tool: "set_status" | "set_budget";
  args: Record<string, unknown>;
  summary: string;
}

export interface BriefingItem {
  id: string;
  kind: BriefingKind;
  severity: BriefingSeverity;
  level: RuleLevel;
  entityId: string;
  entityName: string;
  campaign?: string;
  headline: string;          // e.g. "Pause — ฿4,200 spent, 0 conversions"
  detail: string;            // the evidence sentence
  metrics: BriefingMetric[];
  score: number;             // ranking weight (desc)
  proposal?: BriefingProposal;
}

export interface BriefingSummary {
  spend: number; revenue: number; roas: number; leads: number; purchases: number; messaging: number;
  spendDelta: number | null; roasDelta: number | null; cplDelta: number | null;
}

export interface Briefing {
  accountId: string;
  accountName?: string;
  generatedAt: number;
  period: { since: string; until: string };
  previousPeriod: { since: string; until: string };
  headline: string;
  summary: BriefingSummary;
  items: BriefingItem[];
}
