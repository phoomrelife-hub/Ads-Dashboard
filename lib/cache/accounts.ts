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
