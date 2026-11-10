import { getContactPage } from '../../repositories/contact-page'
import { requireSuperEditor } from '../../utils/require-editor'

export default defineEventHandler(async (event) => {
  await requireSuperEditor(event, 'Hanya Editor super yang dapat mengatur halaman Kontak.')
  return getContactPage(event)
})
