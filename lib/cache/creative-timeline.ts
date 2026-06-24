import { supabase } from '@/lib/supabase'

const TTL_MS = 60 * 60 * 1000 // 1 hour

export async function getCachedTimeline(
  accountId: string,
  preset: string,
  since?: string,
  until?: string,
) {
  const { data } = await supabase
    .from('creative_timeline_cache')
    .select('data,cached_at')
    .eq('account_id', accountId)
    .eq('preset', preset)
    .eq('since', since ?? '')
    .eq('until', until ?? '')
    .single()
  if (!data) return null
  return {
    points: data.data as any[],
    stale: Date.now() - new Date(data.cached_at).getTime() > TTL_MS,
  }
}

export async function setCachedTimeline(
  accountId: string,
  preset: string,
  since: string | undefined,
  until: string | undefined,
  points: any[],
) {
  await supabase
    .from('creative_timeline_cache')
    .upsert(
      {
        account_id: accountId,
        preset,
        since: since ?? '',
        until: until ?? '',
        data: points,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,preset,since,until' },
    )
    .catch(() => {})
}
