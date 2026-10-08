import { listFavoriteIds } from '../../repositories/favorites'

export default defineEventHandler((event) => listFavoriteIds(event))
