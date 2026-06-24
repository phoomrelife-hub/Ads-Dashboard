// Server-side persistence for Pixel Agents.
// Stored as a JSON file beside accounts-cache.json. API keys live here and are
// never returned to the browser (see toPublic / the GET handler).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Agent, AgentsStore, ChatMessage, LogEntry, LogKind, Office, PublicAgent, Rule, RuleRun, Session } from "./types";

const MAX_LOGS = 400;
const MAX_RUNS = 300;
const MAX_SESSIONS_PER_AGENT = 30;

const STORE_PATH = path.join(process.cwd(), "agents-store.json");

function defaultOffice(): Office {
  const cols = 20;
  const rows = 14;
  const tiles = new Array(cols * rows).fill(0) as Office["tiles"];
  // wall border around the room
  for (let x = 0; x < cols; x++) {
    tiles[x] = 1; // top
    tiles[(rows - 1) * cols + x] = 1; // bottom
  }
  for (let y = 0; y < rows; y++) {
    tiles[y * cols] = 1; // left
    tiles[y * cols + (cols - 1)] = 1; // right
  }
  return { cols, rows, tiles, furniture: [] };
}

function emptyStore(): AgentsStore {
  return { agents: [], office: defaultOffice(), logs: [], rules: [], ruleRuns: [], sessions: [] };
}

export function readStore(): AgentsStore {
  if (!existsSync(STORE_PATH)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Partial<AgentsStore>;
    return {
      agents: parsed.agents ?? [],
      office: parsed.office ?? defaultOffice(),
      logs: parsed.logs ?? [],
      rules: parsed.rules ?? [],
      ruleRuns: parsed.ruleRuns ?? [],
      sessions: parsed.sessions ?? [],
    };
  } catch {
    return emptyStore();
  }
}

export function appendRuleRun(run: Omit<RuleRun, "id">): void {
  const store = readStore();
  store.ruleRuns.push({ id: newId(), ...run });
  if (store.ruleRuns.length > MAX_RUNS) store.ruleRuns = store.ruleRuns.slice(-MAX_RUNS);
  writeStore(store);
}

export function readRuleRuns(ruleId?: string): RuleRun[] {
  const runs = readStore().ruleRuns;
  const f = ruleId ? runs.filter((r) => r.ruleId === ruleId) : runs;
  return [...f].sort((a, b) => b.ts - a.ts);
}

export function readRules(agentId?: string): Rule[] {
  const rules = readStore().rules;
  return agentId ? rules.filter((r) => r.agentId === agentId) : rules;
}

// Append an activity log entry (keeps only the most recent MAX_LOGS).
export function appendLog(agentId: string, kind: LogKind, text: string): void {
  const store = readStore();
  store.logs.push({ id: newId(), agentId, ts: Date.now(), kind, text: text.slice(0, 500) });
  if (store.logs.length > MAX_LOGS) store.logs = store.logs.slice(-MAX_LOGS);
  writeStore(store);
}

export function readLogs(agentId?: string): LogEntry[] {
  const logs = readStore().logs;
  const filtered = agentId ? logs.filter((l) => l.agentId === agentId) : logs;
  return [...filtered].sort((a, b) => b.ts - a.ts);
}

export function writeStore(store: AgentsStore): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function toPublic(a: Agent): PublicAgent {
  const { apiKey, ...rest } = a;
  return { ...rest, hasKey: Boolean(apiKey) };
}

export function getAgent(id: string): Agent | undefined {
  return readStore().agents.find((a) => a.id === id);
}

// ── Sessions (resumable conversation threads) ────────────────────────────────

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const t = (firstUser?.content || "New conversation").trim().replace(/\s+/g, " ");
  return t.length > 60 ? t.slice(0, 60) + "…" : t;
}

export function readSessions(agentId?: string): Session[] {
  const sessions = readStore().sessions;
  const f = agentId ? sessions.filter((s) => s.agentId === agentId) : sessions;
  return [...f].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): Session | undefined {
  return readStore().sessions.find((s) => s.id === id);
}

// Create a new session, or overwrite an existing one's messages (the chat client
// always holds the full transcript, so a full overwrite is simplest + race-free).
export function upsertSession(input: { sessionId?: string; agentId: string; messages: ChatMessage[]; title?: string }): Session {
  const store = readStore();
  const now = Date.now();

  if (input.sessionId) {
    const existing = store.sessions.find((s) => s.id === input.sessionId);
    if (existing) {
      existing.messages = input.messages;
      existing.updatedAt = now;
      if (input.title) existing.title = input.title;
      writeStore(store);
      return existing;
    }
  }

  const session: Session = {
    id: newId(), agentId: input.agentId,
    title: input.title || deriveTitle(input.messages),
    createdAt: now, updatedAt: now, messages: input.messages,
  };
  store.sessions.push(session);

  // cap per agent — drop the oldest beyond the limit
  const mine = store.sessions.filter((s) => s.agentId === input.agentId).sort((a, b) => a.updatedAt - b.updatedAt);
  if (mine.length > MAX_SESSIONS_PER_AGENT) {
    const drop = new Set(mine.slice(0, mine.length - MAX_SESSIONS_PER_AGENT).map((s) => s.id));
    store.sessions = store.sessions.filter((s) => !drop.has(s.id));
  }
  writeStore(store);
  return session;
}

export function deleteSession(id: string): void {
  const store = readStore();
  store.sessions = store.sessions.filter((s) => s.id !== id);
  writeStore(store);
}

export function newId(): string {
  return crypto.randomBytes(8).toString("hex");
}
