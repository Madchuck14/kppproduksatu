export interface Product {
  id: string
  slug: string
  title: string
  author: string
  description: string
  category: string
  price: number
  imageUrl: string
  featured: boolean
  bookCode?: string | null
  educationLevel?: 'SD' | 'SMP' | 'SMA' | 'SMK' | null
}

export interface ProductList {
  products: Product[]
  source: 'demo' | 'supabase'
}
