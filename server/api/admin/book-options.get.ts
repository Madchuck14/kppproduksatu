import { requireEditor } from '../../utils/require-editor'

export default defineEventHandler(async (event) => {
  const account = await requireEditor(event)
  return { account }
})
