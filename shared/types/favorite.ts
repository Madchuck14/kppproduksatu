import type { Product } from './product'

export interface FavoriteIds {
  ownerId: string | null
  ids: string[]
  unavailable?: boolean
}

export interface FavoriteList {
  ownerId: string
  products: Product[]
  total: number
  page: number
  pageSize: number
}
