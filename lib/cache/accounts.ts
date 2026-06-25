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
  // Only cache rows that carry a REAL name. On Facebook's development-access tier a throttled/partial
  // /me/adaccounts can return an account with a blank name (or we seed the id as a placeholder via
  // setCachedPages); a plain upsert of that would clobber a real name already cached, leaving the
  // selector stuck showing `act_…` until the next clean fetch. Skipping nameless rows means the live
  // call still surfaces the account this request, but the cache only ever keeps good names.
  const named = accounts.filter(a => a.name && a.name.trim() && a.name !== a.id)
  if (!named.length) return
  await supabase.from('fb_accounts').upsert(
    named.map(a => ({ id: a.id, name: a.name, currency: a.currency ?? null, timezone: a.timezone ?? null, cached_at: now }))
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
  // Ensure the account row exists for the FK constraint, but NEVER clobber a real
  // name already cached by setCachedAccounts. A plain upsert here would overwrite
  // `name` with the id, so when /api/accounts later serves this cache (e.g. on a FB
  // rate limit) the account selector renders the id instead of the name. ON CONFLICT
  // DO NOTHING leaves any existing row (and its real name) untouched.
  await supabase
    .from('fb_accounts')
    .upsert({ id: accountId, name: accountId, cached_at: now }, { onConflict: 'id', ignoreDuplicates: true })
  await supabase.from('fb_pages').upsert(
    pages.map(p => ({ id: p.id, account_id: accountId, name: p.name, cached_at: now }))
  )
}
