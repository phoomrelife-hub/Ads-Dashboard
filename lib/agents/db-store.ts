import { supabase } from '@/lib/supabase'

// ── Agents ────────────────────────────────────────────────────────────────────

export async function getAgents() {
  const { data, error } = await supabase
    .from('agents')
    .select('id,name,role,sprite,provider,model,system_prompt,scope,pos_x,pos_y,created_at,updated_at,api_key')
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map(toPublicAgent)
}

export async function getAgent(id: string) {
  const { data, error } = await supabase
    .from('agents')
    .select('id,name,role,sprite,provider,model,system_prompt,scope,pos_x,pos_y,created_at,updated_at,api_key')
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
    hasKey: Boolean(row.api_key),
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
  return (data ?? []).map((r: any) => ({
    id: r.id,
    agentId: r.agent_id ?? null,
    accountId: r.account_id ?? '',
    name: r.name ?? '',
    schedule: r.schedule,
    condition: r.condition,
    action: r.action,
    instruction: r.instruction ?? undefined,
    level: r.level ?? 'ad',
    datePreset: r.date_preset ?? 'today',
    dryRun: r.dry_run ?? false,
    enabled: r.enabled ?? true,
    lastRunAt: r.last_run_at ?? undefined,
    lastResult: r.last_result ?? undefined,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  }))
}

export async function saveRule(agentId: string, rule: any) {
  const { error } = await supabase.from('rules').upsert({
    id: rule.id,
    agent_id: agentId || null,
    account_id: rule.accountId ?? '',
    name: rule.name ?? '',
    schedule: rule.schedule,
    condition: rule.condition,
    action: rule.action,
    instruction: rule.instruction ?? null,
    level: rule.level ?? 'ad',
    date_preset: rule.datePreset ?? 'today',
    dry_run: rule.dryRun ?? false,
    enabled: rule.enabled ?? true,
    last_run_at: rule.lastRunAt ?? null,
    last_result: rule.lastResult ?? null,
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
  // Atomic message replacement via Postgres function
  const { error: rpcError } = await supabase.rpc('replace_session_messages', {
    p_session_id: session.id,
    p_messages: JSON.parse(JSON.stringify(
      (session.messages ?? []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ?? null,
        toolResults: m.toolResults ?? null,
      }))
    )),
  })
  if (rpcError) throw new Error(rpcError.message)
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

// ── Shared utilities ──────────────────────────────────────────────────────────

export function newId(): string {
  return typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

export function toProviderAgent(a: any) {
  const scopeArr = Array.isArray(a.scope) ? a.scope : [];
  const accountId = scopeArr[0] || a.scope?.accountId || "";
  return {
    ...a,
    apiKey: a.apiKey || "",
    spriteId: 0,
    color: "#5b6cff",
    deskId: null,
    pos: { x: a.posX ?? 0, y: a.posY ?? 0 },
    systemPrompt: a.systemPrompt || "",
    scope: { accountId },
    createdAt: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
  };
}
