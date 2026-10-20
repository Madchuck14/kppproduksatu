import { requireEditor } from '../../utils/require-editor'
import { getStorageUsage } from '../../repositories/storage-usage'

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  return getStorageUsage(event)
})
