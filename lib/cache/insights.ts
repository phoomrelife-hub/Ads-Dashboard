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
