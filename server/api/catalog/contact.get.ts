import { getContactPage } from '../../repositories/contact-page'

export default defineEventHandler((event) => getContactPage(event))
