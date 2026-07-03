import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data, error } = await supabase.from('fb_accounts').select('id,name,cached_at')
  if (error) { console.error('DB FAIL', error.message); process.exit(1) }
  const poisoned = (data ?? []).filter(r => r.name === r.id)
  console.log(`fb_accounts rows: ${data?.length}; poisoned (name===id): ${poisoned.length}`)
  console.log('sample:', (data ?? []).slice(0, 5).map(r => ({ id: r.id, name: r.name })))

  // Now test the live FB call
  const { getAccounts } = await import('../lib/fb')
  try {
    const live = await getAccounts()
    const livePoisoned = live.filter((a: any) => a.name === a.id)
    console.log(`\ngetAccounts() returned ${live.length}; poisoned: ${livePoisoned.length}`)
    console.log('live sample:', live.slice(0, 5).map((a: any) => ({ id: a.id, name: a.name })))
  } catch (e: any) {
    console.error('\ngetAccounts() THREW:', e.message)
  }
}
main()
