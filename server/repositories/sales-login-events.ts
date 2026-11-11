import type { H3Event } from 'h3'
import { z } from 'zod'
import { getEmployeeAdmin } from '../utils/employee-registry'

// The token comes directly from successful Auth sign-in, never from request input.
export async function recordSalesLogin(event: H3Event, userId: string, accessToken: string) {
  const client = getEmployeeAdmin(event)
  const unavailable = () =>
    createError({ statusCode: 503, statusMessage: 'Login belum dapat dicatat. Coba lagi nanti.' })
  const { data, error } = await client
    .from('account_memberships')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data || !['sales', 'editor'].includes(data.role)) throw unavailable()
  if (data.role !== 'sales') return
  let sessionId: string
  try {
    const payload = accessToken.split('.')[1]!
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    sessionId = z.string().uuid().parse(claims.session_id)
  } catch {
    throw unavailable()
  }
  const { error: writeError } = await client.rpc('record_sales_login', {
    p_user_id: userId,
    p_session_id: sessionId,
  })
  if (writeError) throw unavailable()
}
