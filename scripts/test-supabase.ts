import { config } from 'dotenv'
import { resolve } from 'path'

// Load env before any supabase imports
config({ path: resolve(__dirname, '../.env.local') })

// Now import supabase (env vars are available)
async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

  if (!supabaseUrl) {
    console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL is not set')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.from('agents').select('id').limit(1)
  if (error) { console.error('FAIL', error.message); process.exit(1) }
  console.log('OK — agents table reachable, row count:', data?.length ?? 0)
}
main()
