import { NextRequest, NextResponse } from 'next/server'
import { getInsightsHistory } from '@/lib/cache/insights'

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get('accountId')
  const datePreset = req.nextUrl.searchParams.get('datePreset') ?? 'last_30d'
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })
  const history = await getInsightsHistory(accountId, datePreset)
  return NextResponse.json(history)
}
