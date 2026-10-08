import { getLandingSubjectCounts } from '../../repositories/products'

export default defineEventHandler((event) => getLandingSubjectCounts(event))
