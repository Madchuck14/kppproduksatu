import { requireAdmin } from '../../utils/require-admin'

export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  return { id: user.id, email: user.email }
})
