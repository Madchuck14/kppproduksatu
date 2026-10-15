import { listClassifications } from '../../repositories/classifications'

export default defineEventHandler((event) => listClassifications(event))
