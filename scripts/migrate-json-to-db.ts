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
      sprite: agent.sprite ?? String(agent.spriteId ?? 'default'),
      provider: agent.provider ?? 'anthropic',
      model: agent.model ?? 'claude-opus-4-8',
      system_prompt: agent.systemPrompt ?? '',
      scope: agent.scope ? (Array.isArray(agent.scope) ? agent.scope : [agent.scope?.accountId].filter(Boolean)) : [],
      api_key: agent.apiKey ?? null,
      pos_x: agent.posX ?? agent.pos?.x ?? 0,
      pos_y: agent.posY ?? agent.pos?.y ?? 0,
    })
    if (error) console.error(`Agent ${agent.name}:`, error.message)
    else console.log(`✔ Agent: ${agent.name}`)
  }

  // Migrate office layout
  if (store.office || store.officeLayout) {
    const layout = store.office || store.officeLayout
    const { error } = await supabase.from('office_layout').upsert({
      id: 'singleton',
      tiles: layout.tiles ?? [],
      furniture: layout.furniture ?? [],
    })
    if (error) console.error('Office layout:', error.message)
    else console.log('✔ Office layout')
  }

  // Migrate rules
  const rules = store.rules ?? []
  for (const rule of rules) {
    const agentId = rule.agentId
    if (!agentId) {
      console.log(`  Skipping rule ${rule.id} — no agentId`)
      continue
    }
    const { error } = await supabase.from('rules').upsert({
      id: rule.id,
      agent_id: agentId,
      schedule: typeof rule.schedule === 'object' ? JSON.stringify(rule.schedule) : (rule.schedule ?? ''),
      condition: typeof rule.condition === 'object' ? JSON.stringify(rule.condition) : (rule.condition ?? ''),
      action: typeof rule.action === 'object' ? JSON.stringify(rule.action) : (rule.action ?? ''),
      enabled: rule.enabled ?? true,
    })
    if (error) console.error(`Rule ${rule.id}:`, error.message)
    else console.log(`✔ Rule: ${rule.name || rule.id}`)
  }

  // Migrate rule runs
  const ruleRuns = store.ruleRuns ?? []
  for (const run of ruleRuns) {
    const { error } = await supabase.from('rule_runs').upsert({
      id: run.id,
      rule_id: run.ruleId,
      status: run.dryRun ? 'dry-run' : 'applied',
      summary: run.summary ?? null,
      error: run.error ?? null,
    })
    if (error) console.error(`RuleRun ${run.id}:`, error.message)
  }
  if (ruleRuns.length) console.log(`✔ ${ruleRuns.length} rule runs`)

  // Migrate sessions and messages
  const sessions = store.sessions ?? []
  for (const session of sessions) {
    const agentId = session.agentId
    if (!agentId) continue
    const { error: sErr } = await supabase.from('sessions').upsert({
      id: session.id,
      agent_id: agentId,
      title: session.title ?? null,
    })
    if (sErr) { console.error(`Session ${session.id}:`, sErr.message); continue }
    for (const msg of session.messages ?? []) {
      const msgId = msg.id || crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      await supabase.from('chat_messages').upsert({
        id: msgId,
        session_id: session.id,
        role: msg.role,
        content: msg.content ?? '',
        tool_calls: msg.toolCalls ?? null,
        tool_results: msg.toolResults ?? null,
      })
    }
  }
  if (sessions.length) console.log(`✔ ${sessions.length} sessions`)

  console.log('\nMigration complete.')
}

main().catch(e => { console.error(e); process.exit(1) })
