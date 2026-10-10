import { getLandingLevelCounts } from '../../repositories/products'

export default defineEventHandler((event) => getLandingLevelCounts(event))
