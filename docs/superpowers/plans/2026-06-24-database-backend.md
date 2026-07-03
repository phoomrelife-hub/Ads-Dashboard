# Database Backend Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the ads-dashboard to Supabase (already installed) replacing fragile JSON-file persistence, and add a DB-backed insights snapshot layer for historical metrics.

**Architecture:** Four tasks in sequence — (1) create Supabase client singleton + SQL schema, (2) migrate the agents/rules/sessions/logs system from `agents-store.json` to Supabase, (3) migrate account and page caches from JSON files to Supabase, (4) add an insights snapshot table that stores FB API responses for historical trend views.

**Tech Stack:** Next.js 16, `@supabase/supabase-js` v2 (already installed), TypeScript

## Global Constraints

- `@supabase/supabase-js` and `@supabase/ssr` are already installed — do NOT add Prisma
- All DB access goes through `lib/supabase.ts` singleton — never call `createClient` inline
- Never expose the service role key to the browser — server-side routes only
- Maintain 100% API compatibility — all existing `app/api/**` route responses keep the same shape so no frontend changes are needed
- `.env.local` already has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- RLS is disabled on all new tables (internal tool, single-tenant) — use `SUPABASE_SERVICE_ROLE_KEY` for all server-side writes; fall back to anon key if service role key not set
- Do NOT use `NEXT_PUBLIC_` prefix for `SUPABASE_SERVICE_ROLE_KEY` — server-side only
- Run `npx tsx` (already available) to run TypeScript scripts

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/schema.sql` | Create | Full SQL schema — run once in Supabase SQL editor |
| `lib/supabase.ts` | Create | Supabase client singleton (server-side) |
| `lib/agents/db-store.ts` | Create | Supabase-backed replacement for `store.ts` with identical exports |
| `lib/agents/store.ts` | Modify | Re-export everything from `db-store.ts` (thin shim) |
| `lib/cache/accounts.ts` | Create | Supabase-backed FB account + page cache |
| `app/api/accounts/route.ts` | Modify | Use `lib/cache/accounts.ts` instead of `accounts-cache.json` |
| `app/api/pages/route.ts` | Modify | Use `lib/cache/accounts.ts` instead of `pages-cache-*.json` |
| `lib/cache/insights.ts` | Create | Read/write insights snapshots from Supabase |
| `app/api/insights/route.ts` | Modify | Write snapshot after successful FB fetch |
| `app/api/insights/history/route.ts` | Create | Return historical snapshots for an account |
| `scripts/migrate-json-to-db.ts` | Create | One-time migration from `agents-store.json` to Supabase |

---

## Task 1: Supabase Client + SQL Schema

**Files:**
- Create: `supabase/schema.sql`
- Create: `lib/supabase.ts`
- Modify: `.env.local` (add `SUPABASE_SERVICE_ROLE_KEY`)

**Interfaces:**
- Produces: `supabase` client exported from `lib/supabase.ts` — all later tasks import from here

---

- [ ] **Step 1: Get service role key**

In Supabase Console → Project → Settings → API → copy the **service_role** key (the long one labeled "secret").

Add to `.env.local`:
```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-service-role-key
```

- [ ] **Step 2: Create Supabase server client**

Create `lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})
```

- [ ] **Step 3: Write SQL schema**

Create `supabase/schema.sql`:

```sql
-- ── Agents system ──────────────────────────────────────────────────────────────

create table if not exists agents (
  id           text primary key,
  name         text not null,
  role         text not null default '',
  sprite       text not null default 'default',
  provider     text not null default 'anthropic',
  model        text not null,
  system_prompt text not null default '',
  scope        text[] not null default '{}',
  api_key      text,
  pos_x        integer not null default 0,
  pos_y        integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists rules (
  id        text primary key,
  agent_id  text not null references agents(id) on delete cascade,
  schedule  text not null default '',
  condition text not null default '',
  action    text not null default '',
  enabled   boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists rule_runs (
  id        text primary key default gen_random_uuid()::text,
  rule_id   text not null references rules(id) on delete cascade,
  status    text not null,
  summary   text,
  error     text,
  ran_at    timestamptz not null default now()
);

create table if not exists sessions (
  id         text primary key,
  agent_id   text not null references agents(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id          text primary key,
  session_id  text not null references sessions(id) on delete cascade,
  role        text not null,
  content     text not null,
  tool_calls  jsonb,
  tool_results jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists logs (
  id         text primary key default gen_random_uuid()::text,
  agent_id   text not null references agents(id) on delete cascade,
  type       text not null,
  message    text not null,
  meta       jsonb,
  created_at timestamptz not null default now()
);

create table if not exists office_layout (
  id        text primary key default 'singleton',
  tiles     jsonb not null default '[]',
  furniture jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ── Facebook cache ─────────────────────────────────────────────────────────────

create table if not exists fb_accounts (
  id        text primary key,
  name      text not null,
  currency  text,
  timezone  text,
  cached_at timestamptz not null default now()
);

create table if not exists fb_pages (
  id         text primary key,
  account_id text not null references fb_accounts(id) on delete cascade,
  name       text not null,
  cached_at  timestamptz not null default now()
);

-- ── Insights snapshots ─────────────────────────────────────────────────────────

create table if not exists insights_snapshots (
  id          text primary key default gen_random_uuid()::text,
  account_id  text not null,
  date_preset text not null,
  dimension   text not null default 'none',
  data        jsonb not null,
  snapshot_at timestamptz not null default now(),
  unique (account_id, date_preset, dimension)
);

create index if not exists insights_snapshots_account_id_idx on insights_snapshots (account_id);

-- Disable RLS on all tables (internal tool)
alter table agents disable row level security;
alter table rules disable row level security;
alter table rule_runs disable row level security;
alter table sessions disable row level security;
alter table chat_messages disable row level security;
alter table logs disable row level security;
alter table office_layout disable row level security;
alter table fb_accounts disable row level security;
alter table fb_pages disable row level security;
alter table insights_snapshots disable row level security;
```

- [ ] **Step 4: Run schema in Supabase**

Go to Supabase Console → SQL Editor → paste the entire contents of `supabase/schema.sql` → Run.

Expected: "Success. No rows returned."

- [ ] **Step 5: Verify tables exist**

In Supabase Console → Table Editor, confirm these tables appear:
`agents`, `rules`, `rule_runs`, `sessions`, `chat_messages`, `logs`, `office_layout`, `fb_accounts`, `fb_pages`, `insights_snapshots`

- [ ] **Step 6: Test client connection**

Create a temporary test file `scripts/test-supabase.ts`:

```typescript
import { supabase } from '../lib/supabase'

async function main() {
  const { data, error } = await supabase.from('agents').select('id').limit(1)
  if (error) { console.error('FAIL', error.message); process.exit(1) }
  console.log('OK — agents table reachable, row count:', data?.length ?? 0)
}
main()
```

Run:
```bash
cd D:\ERP\ads-dashboard && npx tsx scripts/test-supabase.ts
```

Expected: `OK — agents table reachable, row count: 0`

Delete the test file after confirming.

- [ ] **Step 7: Commit**

```bash
git -C D:\ERP\ads-dashboard add supabase/schema.sql lib/supabase.ts
git -C D:\ERP\ads-dashboard commit -m "feat: add Supabase client singleton and SQL schema"
```

---

## Task 2: Migrate Agents System from JSON to Supabase

**Files:**
- Create: `lib/agents/db-store.ts`
- Modify: `lib/agents/store.ts` (replace body with re-exports)
- Create: `scripts/migrate-json-to-db.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts`
- Produces: same exports as current `lib/agents/store.ts` — `getAgents`, `getAgent`, `getAgentWithKey`, `saveAgent`, `deleteAgent`, `getOfficeLayout`, `saveOfficeLayout`, `addLog`, `getLogs`, `getRules`, `saveRule`, `deleteRule`, `addRuleRun`, `getRuleRuns`, `getSessions`, `getSession`, `saveSession`, `deleteSession`

---

- [ ] **Step 1: Read current store.ts**

Read `lib/agents/store.ts` in full. Note every exported function name and return type — `db-store.ts` must export the same names.

Also read `lib/agents/types.ts` to understand `Agent`, `Rule`, `Session`, `ChatMessage`, `Log`, `RuleRun` type shapes.

- [ ] **Step 2: Create db-store.ts**

Create `lib/agents/db-store.ts`:

```typescript
import { supabase } from '@/lib/supabase'
import { nanoid } from 'nanoid' // use crypto.randomUUID() if nanoid not available

function uuid() {
  return typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

// ── Agents ────────────────────────────────────────────────────────────────────

export async function getAgents() {
  const { data, error } = await supabase
    .from('agents')
    .select('id,name,role,sprite,provider,model,system_prompt,scope,pos_x,pos_y,created_at,updated_at')
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map(toPublicAgent)
}

export async function getAgent(id: string) {
  const { data, error } = await supabase
    .from('agents')
    .select('id,name,role,sprite,provider,model,system_prompt,scope,pos_x,pos_y,created_at,updated_at')
    .eq('id', id)
    .single()
  if (error) return undefined
  return toPublicAgent(data)
}

export async function getAgentWithKey(id: string) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return undefined
  return { ...toPublicAgent(data), apiKey: data.api_key }
}

export async function saveAgent(agent: any) {
  const { error } = await supabase.from('agents').upsert({
    id: agent.id,
    name: agent.name,
    role: agent.role ?? '',
    sprite: agent.sprite ?? 'default',
    provider: agent.provider ?? 'anthropic',
    model: agent.model,
    system_prompt: agent.systemPrompt ?? '',
    scope: agent.scope ?? [],
    api_key: agent.apiKey ?? null,
    pos_x: agent.posX ?? 0,
    pos_y: agent.posY ?? 0,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function deleteAgent(id: string) {
  const { error } = await supabase.from('agents').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

function toPublicAgent(row: any) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    sprite: row.sprite,
    provider: row.provider,
    model: row.model,
    systemPrompt: row.system_prompt,
    scope: row.scope ?? [],
    posX: row.pos_x,
    posY: row.pos_y,
    // apiKey intentionally omitted
  }
}

// ── Office layout ─────────────────────────────────────────────────────────────

export async function getOfficeLayout() {
  const { data } = await supabase.from('office_layout').select('tiles,furniture').eq('id', 'singleton').single()
  return data ? { tiles: data.tiles as object[], furniture: data.furniture as object[] } : { tiles: [], furniture: [] }
}

export async function saveOfficeLayout(layout: { tiles: object[]; furniture: object[] }) {
  const { error } = await supabase.from('office_layout').upsert({
    id: 'singleton',
    tiles: layout.tiles,
    furniture: layout.furniture,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

// ── Logs ──────────────────────────────────────────────────────────────────────

const LOG_CAP = 400

export async function addLog(agentId: string, entry: { type: string; message: string; meta?: any }) {
  await supabase.from('logs').insert({ agent_id: agentId, type: entry.type, message: entry.message, meta: entry.meta ?? null })
  // Enforce cap: count and delete oldest
  const { count } = await supabase.from('logs').select('*', { count: 'exact', head: true }).eq('agent_id', agentId)
  if ((count ?? 0) > LOG_CAP) {
    const { data: oldest } = await supabase
      .from('logs')
      .select('id')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: true })
      .limit((count ?? 0) - LOG_CAP)
    if (oldest?.length) {
      await supabase.from('logs').delete().in('id', oldest.map((r: any) => r.id))
    }
  }
}

export async function getLogs(agentId: string) {
  const { data } = await supabase
    .from('logs')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(LOG_CAP)
  return (data ?? []).map((r: any) => ({ id: r.id, agentId: r.agent_id, type: r.type, message: r.message, meta: r.meta, createdAt: r.created_at }))
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export async function getRules(agentId: string) {
  const { data } = await supabase.from('rules').select('*').eq('agent_id', agentId).order('created_at')
  return (data ?? []).map((r: any) => ({ id: r.id, agentId: r.agent_id, schedule: r.schedule, condition: r.condition, action: r.action, enabled: r.enabled }))
}

export async function saveRule(agentId: string, rule: any) {
  const { error } = await supabase.from('rules').upsert({
    id: rule.id,
    agent_id: agentId,
    schedule: rule.schedule,
    condition: rule.condition,
    action: rule.action,
    enabled: rule.enabled ?? true,
  })
  if (error) throw new Error(error.message)
}

export async function deleteRule(id: string) {
  const { error } = await supabase.from('rules').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

const RULE_RUN_CAP = 300

export async function addRuleRun(ruleId: string, run: { status: string; summary?: string; error?: string }) {
  await supabase.from('rule_runs').insert({ rule_id: ruleId, status: run.status, summary: run.summary ?? null, error: run.error ?? null })
  const { count } = await supabase.from('rule_runs').select('*', { count: 'exact', head: true }).eq('rule_id', ruleId)
  if ((count ?? 0) > RULE_RUN_CAP) {
    const { data: oldest } = await supabase
      .from('rule_runs')
      .select('id')
      .eq('rule_id', ruleId)
      .order('ran_at', { ascending: true })
      .limit((count ?? 0) - RULE_RUN_CAP)
    if (oldest?.length) {
      await supabase.from('rule_runs').delete().in('id', oldest.map((r: any) => r.id))
    }
  }
}

export async function getRuleRuns(ruleId: string) {
  const { data } = await supabase.from('rule_runs').select('*').eq('rule_id', ruleId).order('ran_at', { ascending: false }).limit(RULE_RUN_CAP)
  return (data ?? []).map((r: any) => ({ id: r.id, ruleId: r.rule_id, status: r.status, summary: r.summary, error: r.error, ranAt: r.ran_at }))
}

// ── Sessions ──────────────────────────────────────────────────────────────────

const SESSION_CAP = 30

export async function getSessions(agentId: string) {
  const { data: sessionRows } = await supabase
    .from('sessions')
    .select('*')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(SESSION_CAP)
  if (!sessionRows?.length) return []
  const ids = sessionRows.map((s: any) => s.id)
  const { data: msgRows } = await supabase
    .from('chat_messages')
    .select('*')
    .in('session_id', ids)
    .order('created_at')
  const msgsBySession: Record<string, any[]> = {}
  for (const m of msgRows ?? []) {
    ;(msgsBySession[m.session_id] ??= []).push(toMessage(m))
  }
  return sessionRows.map((s: any) => ({ id: s.id, agentId: s.agent_id, title: s.title, messages: msgsBySession[s.id] ?? [], createdAt: s.created_at, updatedAt: s.updated_at }))
}

export async function getSession(id: string) {
  const { data: s } = await supabase.from('sessions').select('*').eq('id', id).single()
  if (!s) return undefined
  const { data: msgs } = await supabase.from('chat_messages').select('*').eq('session_id', id).order('created_at')
  return { id: s.id, agentId: s.agent_id, title: s.title, messages: (msgs ?? []).map(toMessage), createdAt: s.created_at, updatedAt: s.updated_at }
}

export async function saveSession(agentId: string, session: any) {
  const now = new Date().toISOString()
  await supabase.from('sessions').upsert({ id: session.id, agent_id: agentId, title: session.title ?? null, updated_at: now })
  // Replace messages
  await supabase.from('chat_messages').delete().eq('session_id', session.id)
  if (session.messages?.length) {
    await supabase.from('chat_messages').insert(
      session.messages.map((m: any) => ({
        id: m.id,
        session_id: session.id,
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls ?? null,
        tool_results: m.toolResults ?? null,
      }))
    )
  }
  // Enforce session cap
  const { count } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('agent_id', agentId)
  if ((count ?? 0) > SESSION_CAP) {
    const { data: oldest } = await supabase
      .from('sessions')
      .select('id')
      .eq('agent_id', agentId)
      .order('updated_at', { ascending: true })
      .limit((count ?? 0) - SESSION_CAP)
    if (oldest?.length) {
      await supabase.from('sessions').delete().in('id', oldest.map((r: any) => r.id))
    }
  }
}

export async function deleteSession(id: string) {
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

function toMessage(r: any) {
  return { id: r.id, sessionId: r.session_id, role: r.role, content: r.content, toolCalls: r.tool_calls, toolResults: r.tool_results, createdAt: r.created_at }
}
```

- [ ] **Step 3: Replace store.ts with thin re-export shim**

Open `lib/agents/store.ts`, delete its entire body, replace with:

```typescript
export {
  getAgents,
  getAgent,
  getAgentWithKey,
  saveAgent,
  deleteAgent,
  getOfficeLayout,
  saveOfficeLayout,
  addLog,
  getLogs,
  getRules,
  saveRule,
  deleteRule,
  addRuleRun,
  getRuleRuns,
  getSessions,
  getSession,
  saveSession,
  deleteSession,
} from './db-store'
```

- [ ] **Step 4: Write one-time migration script**

Create `scripts/migrate-json-to-db.ts`:

```typescript
import { readFileSync, existsSync } from 'fs'
import { supabase } from '../lib/supabase'

async function main() {
  const storePath = 'agents-store.json'
  if (!existsSync(storePath)) {
    console.log('No agents-store.json found — nothing to migrate.')
    return
  }

  const store = JSON.parse(readFileSync(storePath, 'utf-8'))

  // Migrate agents
  for (const agent of store.agents ?? []) {
    const { error } = await supabase.from('agents').upsert({
      id: agent.id,
      name: agent.name,
      role: agent.role ?? '',
      sprite: agent.sprite ?? 'default',
      provider: agent.provider ?? 'anthropic',
      model: agent.model ?? 'claude-opus-4-8',
      system_prompt: agent.systemPrompt ?? '',
      scope: agent.scope ?? [],
      api_key: agent.apiKey ?? null,
      pos_x: agent.posX ?? 0,
      pos_y: agent.posY ?? 0,
    })
    if (error) console.error(`Agent ${agent.name}:`, error.message)
    else console.log(`✔ Agent: ${agent.name}`)
  }

  // Migrate office layout
  if (store.officeLayout) {
    await supabase.from('office_layout').upsert({
      id: 'singleton',
      tiles: store.officeLayout.tiles ?? [],
      furniture: store.officeLayout.furniture ?? [],
    })
    console.log('✔ Office layout')
  }

  // Migrate rules per agent
  for (const [agentId, rules] of Object.entries(store.rules ?? {})) {
    for (const rule of rules as any[]) {
      await supabase.from('rules').upsert({
        id: rule.id,
        agent_id: agentId,
        schedule: rule.schedule ?? '',
        condition: rule.condition ?? '',
        action: rule.action ?? '',
        enabled: rule.enabled ?? true,
      })
    }
    console.log(`✔ Rules for agent ${agentId}`)
  }

  // Migrate sessions and messages per agent
  for (const [agentId, sessions] of Object.entries(store.sessions ?? {})) {
    for (const session of sessions as any[]) {
      await supabase.from('sessions').upsert({ id: session.id, agent_id: agentId, title: session.title ?? null })
      for (const msg of session.messages ?? []) {
        await supabase.from('chat_messages').upsert({
          id: msg.id,
          session_id: session.id,
          role: msg.role,
          content: msg.content,
          tool_calls: msg.toolCalls ?? null,
          tool_results: msg.toolResults ?? null,
        })
      }
    }
    console.log(`✔ Sessions for agent ${agentId}`)
  }

  console.log('\nMigration complete.')
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 5: Run the migration**

```bash
cd D:\ERP\ads-dashboard && npx tsx scripts/migrate-json-to-db.ts
```

Expected output:
```
✔ Agent: [each agent name]
✔ Office layout
✔ Rules for agent ...
✔ Sessions for agent ...

Migration complete.
```

- [ ] **Step 6: Smoke-test agents API**

```bash
curl http://localhost:3100/api/agents
```

Expected: JSON array of agents (same shape as before, no `apiKey` field).

- [ ] **Step 7: Commit**

```bash
git -C D:\ERP\ads-dashboard add lib/agents/db-store.ts lib/agents/store.ts scripts/migrate-json-to-db.ts
git -C D:\ERP\ads-dashboard commit -m "feat: migrate agents system from JSON file to Supabase"
```

---

## Task 3: Migrate Account and Page Caches to Supabase

**Files:**
- Create: `lib/cache/accounts.ts`
- Modify: `app/api/accounts/route.ts`
- Modify: `app/api/pages/route.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts`
- Produces: `getCachedAccounts(ttlMs?)`, `setCachedAccounts(accounts)`, `getCachedPages(accountId, ttlMs?)`, `setCachedPages(accountId, pages)`

---

- [ ] **Step 1: Create the cache helper**

Create `lib/cache/accounts.ts`:

```typescript
import { supabase } from '@/lib/supabase'

const ACCOUNT_TTL_MS = 10 * 60 * 1000

export async function getCachedAccounts(ttlMs = ACCOUNT_TTL_MS) {
  const { data } = await supabase.from('fb_accounts').select('id,name,currency,timezone,cached_at')
  if (!data?.length) return null
  const oldest = Math.min(...data.map(r => new Date(r.cached_at).getTime()))
  if (Date.now() - oldest > ttlMs) return null
  return data.map(r => ({ id: r.id, name: r.name, currency: r.currency, timezone: r.timezone }))
}

export async function setCachedAccounts(accounts: { id: string; name: string; currency?: string; timezone?: string }[]) {
  const now = new Date().toISOString()
  await supabase.from('fb_accounts').upsert(
    accounts.map(a => ({ id: a.id, name: a.name, currency: a.currency ?? null, timezone: a.timezone ?? null, cached_at: now }))
  )
}

export async function getCachedPages(accountId: string, ttlMs = ACCOUNT_TTL_MS) {
  const { data } = await supabase.from('fb_pages').select('id,name,cached_at').eq('account_id', accountId)
  if (!data?.length) return null
  const oldest = Math.min(...data.map(r => new Date(r.cached_at).getTime()))
  if (Date.now() - oldest > ttlMs) return null
  return data.map(r => ({ id: r.id, name: r.name }))
}

export async function setCachedPages(accountId: string, pages: { id: string; name: string }[]) {
  const now = new Date().toISOString()
  // Ensure account row exists (FK constraint)
  await supabase.from('fb_accounts').upsert({ id: accountId, name: accountId, cached_at: now })
  await supabase.from('fb_pages').upsert(
    pages.map(p => ({ id: p.id, account_id: accountId, name: p.name, cached_at: now }))
  )
}
```

- [ ] **Step 2: Update accounts route**

Read `app/api/accounts/route.ts` fully first.

Find where it reads from `accounts-cache.json` (likely `readFileSync` or similar) and replace the cache read/write with:

```typescript
import { getCachedAccounts, setCachedAccounts } from '@/lib/cache/accounts'

// Replace the JSON file cache check with:
const cached = await getCachedAccounts()
if (cached) return NextResponse.json(cached)

// After fetching accounts from FB, replace the JSON file write with:
await setCachedAccounts(accounts)
```

Keep all FB-fetch logic and response shape exactly as-is. Only the cache read/write changes.

- [ ] **Step 3: Update pages route**

Read `app/api/pages/route.ts` fully first.

Replace the `pages-cache-*.json` file reads/writes with:

```typescript
import { getCachedPages, setCachedPages } from '@/lib/cache/accounts'

// Replace file cache check:
const cached = await getCachedPages(accountId)
if (cached) return NextResponse.json(cached)

// After FB fetch:
await setCachedPages(accountId, pages)
```

- [ ] **Step 4: Start dev server and verify**

```bash
npm run dev
```

In another terminal:
```bash
curl http://localhost:3100/api/accounts
curl "http://localhost:3100/api/pages?accountId=act_XXXXXX"
```

Expected: same JSON response as before. Second call of each should return faster (DB hit).

- [ ] **Step 5: Delete old JSON cache files**

```bash
cd D:\ERP\ads-dashboard
del accounts-cache.json 2>nul
del pages-cache-all.json 2>nul
for /f %f in ('dir /b pages-cache-*.json 2^>nul') do del "%f"
```

- [ ] **Step 6: Commit**

```bash
git -C D:\ERP\ads-dashboard add lib/cache/accounts.ts app/api/accounts/route.ts app/api/pages/route.ts
git -C D:\ERP\ads-dashboard commit -m "feat: migrate account and page caches from JSON files to Supabase"
```

---

## Task 4: Insights Snapshot Table

**Files:**
- Create: `lib/cache/insights.ts`
- Modify: `app/api/insights/route.ts`
- Create: `app/api/insights/history/route.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts`
- Produces: `GET /api/insights/history?accountId=X&datePreset=Y` returns array of `{ snapshotAt, dimension, data }` sorted newest-first

---

- [ ] **Step 1: Create insights cache helper**

Create `lib/cache/insights.ts`:

```typescript
import { supabase } from '@/lib/supabase'

export async function setInsightsSnapshot(accountId: string, datePreset: string, dimension: string, data: unknown) {
  await supabase.from('insights_snapshots').upsert({
    account_id: accountId,
    date_preset: datePreset,
    dimension,
    data: data as object,
    snapshot_at: new Date().toISOString(),
  }, { onConflict: 'account_id,date_preset,dimension' })
}

export async function getInsightsHistory(accountId: string, datePreset: string, limit = 30) {
  const { data } = await supabase
    .from('insights_snapshots')
    .select('snapshot_at,dimension,data')
    .eq('account_id', accountId)
    .eq('date_preset', datePreset)
    .order('snapshot_at', { ascending: false })
    .limit(limit)
  return data ?? []
}
```

- [ ] **Step 2: Write snapshot after each FB fetch**

Read `app/api/insights/route.ts` fully first.

After the FB API response is fetched successfully (find where the response data is returned/used), add a fire-and-forget snapshot write. Add this import at the top:

```typescript
import { setInsightsSnapshot } from '@/lib/cache/insights'
```

Then after the successful FB response (before or alongside the `return NextResponse.json(...)` call), add:

```typescript
// Non-blocking snapshot — don't await, don't let failure break the response
const accountId = req.nextUrl.searchParams.get('accountId') ?? ''
const datePreset = req.nextUrl.searchParams.get('datePreset') ?? 'last_30d'
const dimension = req.nextUrl.searchParams.get('dimension') ?? 'none'
setInsightsSnapshot(accountId, datePreset, dimension, data).catch(() => {})
```

Adapt the variable names to match what's already in the route.

- [ ] **Step 3: Create the history endpoint**

Create `app/api/insights/history/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getInsightsHistory } from '@/lib/cache/insights'

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId')
  const datePreset = req.nextUrl.searchParams.get('datePreset') ?? 'last_30d'
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })
  const history = await getInsightsHistory(accountId, datePreset)
  return NextResponse.json(history)
}
```

- [ ] **Step 4: Test the history endpoint**

Load the dashboard once to trigger a live FB fetch (which writes a snapshot). Then:

```bash
curl "http://localhost:3100/api/insights/history?accountId=act_XXXXXX&datePreset=last_30d"
```

Expected: JSON array with at least one entry with `{ snapshot_at, dimension, data }`.

- [ ] **Step 5: Commit**

```bash
git -C D:\ERP\ads-dashboard add lib/cache/insights.ts app/api/insights/route.ts app/api/insights/history/route.ts
git -C D:\ERP\ads-dashboard commit -m "feat: add insights snapshot table for historical metrics"
```

---

## What Gets Connected After This Plan

| Before | After |
|---|---|
| Agents in `agents-store.json` (corrupts under concurrent writes) | Supabase `agents`, `rules`, `sessions`, `logs` tables |
| Account list in `accounts-cache.json` | `fb_accounts` Supabase table |
| Pages in `pages-cache-*.json` | `fb_pages` Supabase table |
| No historical data | `insights_snapshots` — grows with every FB fetch, queryable via `/api/insights/history` |
| In-memory cache (lost on cold start) | Supabase-backed cache (survives restarts) |
