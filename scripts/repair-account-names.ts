// One-off repair: refetch real account names from Meta and overwrite the rows that
// setCachedPages previously clobbered (name === id). Retries through the ads-management
// throttle (code 80004) with backoff. Safe to re-run.
import { config } from 'dotenv'
import { resolve } from 'path'
import crypto from 'node:crypto'
config({ path: resolve(__dirname, '../.env.local') })

const API = 'https://graph.facebook.com/v21.0'
const TOKEN = process.env.FACEBOOK_MARKETING_API || process.env.FB_ACCESS_TOKEN || ''
const APP_SECRET = process.env.APP_SECRET || ''
const PROOF = APP_SECRET ? crypto.createHmac('sha256', APP_SECRET).update(TOKEN).digest('hex') : ''
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchAccounts(): Promise<{ id: string; name: string; active: boolean }[]> {
  const params = new URLSearchParams({ fields: 'name,account_id,account_status', limit: '200', access_token: TOKEN })
  if (PROOF) params.set('appsecret_proof', PROOF)
  const res = await fetch(`${API}/me/adaccounts?${params}`)
  const json: any = await res.json()
  if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code })
  return (json.data ?? []).map((x: any) => ({ id: `act_${x.account_id}`, name: x.name, active: x.account_status === 1 }))
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  )

  const delays = [0, 15_000, 30_000, 60_000, 120_000, 120_000, 180_000, 180_000, 240_000, 300_000]
  let list: { id: string; name: string }[] | null = null
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) { console.log(`waiting ${delays[i] / 1000}s before retry ${i}...`); await sleep(delays[i]) }
    try {
      list = await fetchAccounts()
      console.log(`FB OK on attempt ${i + 1}: ${list.length} accounts`)
      break
    } catch (e: any) {
      console.log(`attempt ${i + 1} failed: code=${e.code} ${e.message}`)
    }
  }
  if (!list) { console.error('Could not reach Meta — still throttled. Re-run later or let it self-heal on the next successful /api/accounts.'); process.exit(1) }

  const now = new Date().toISOString()
  const { error } = await supabase.from('fb_accounts').upsert(
    list.map(a => ({ id: a.id, name: a.name, cached_at: now }))
  )
  if (error) { console.error('DB write failed:', error.message); process.exit(1) }

  const { data: after } = await supabase.from('fb_accounts').select('id,name')
  const stillPoisoned = (after ?? []).filter(r => r.name === r.id)
  console.log(`Repaired. fb_accounts rows: ${after?.length}; still poisoned: ${stillPoisoned.length}`)
  if (stillPoisoned.length) console.log('remaining id-as-name rows:', stillPoisoned.map(r => r.id))
}
main()
