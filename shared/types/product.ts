import type { BookSubject } from '../utils/book-subjects'

export interface Product {
  id: string
  slug: string
  title: string
  author: string
  description: string
  highlights?: string[]
  price: number
  imageUrl: string
  featured: boolean
  bookCode?: string | null
  educationLevel?: 'SD' | 'SMP' | 'SMA' | 'SMK' | null
  subject?: BookSubject | null
  grade?: number | null
  publicationYear?: number | null
}

export interface ProductList {
  products: Product[]
  source: 'demo' | 'supabase'
  total?: number
  page?: number
  pageSize?: number
  subjectCounts?: Record<string, number>
}
