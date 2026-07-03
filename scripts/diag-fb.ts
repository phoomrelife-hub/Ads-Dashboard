import { config } from 'dotenv'
import { resolve } from 'path'
import crypto from 'node:crypto'
config({ path: resolve(__dirname, '../.env.local') })

async function main() {
  const API = 'https://graph.facebook.com/v21.0'
  const TOKEN = process.env.FACEBOOK_MARKETING_API || process.env.FB_ACCESS_TOKEN || ''
  const APP_SECRET = process.env.APP_SECRET || ''
  const PROOF = APP_SECRET ? crypto.createHmac('sha256', APP_SECRET).update(TOKEN).digest('hex') : ''
  console.log('TOKEN set:', !!TOKEN, '| APP_SECRET set:', !!APP_SECRET)

  const params = new URLSearchParams({ fields: 'name,account_id,account_status', limit: '200', access_token: TOKEN })
  if (PROOF) params.set('appsecret_proof', PROOF)
  const res = await fetch(`${API}/me/adaccounts?${params}`)
  const json: any = await res.json()
  if (json.error) { console.error('FB ERROR:', JSON.stringify(json.error)); return }
  const data = json.data ?? []
  console.log(`FB returned ${data.length} accounts`)
  console.log('sample:', data.slice(0, 6).map((x: any) => ({ account_id: x.account_id, name: x.name })))
  const noName = data.filter((x: any) => !x.name)
  console.log('accounts with empty name:', noName.length)
}
main()
