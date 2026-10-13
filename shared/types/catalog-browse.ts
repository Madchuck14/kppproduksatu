import type { Product, ProductList } from './product'

export interface CatalogBrowse {
  source: ProductList['source']
  groups: { code: string; total: number; products: Product[] }[]
}
