import { requireAccount } from '../../utils/require-account'

export default defineEventHandler((event) => requireAccount(event))
