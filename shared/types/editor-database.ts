import type { Classification } from '../schemas/classifications'

// Runtime rows are also validated in the repository. Keep this write contract aligned
// with the catalog migrations until generated database types replace it.
type BookRow = {
  id: string
  book_code: string | null
  education_level: 'SD' | 'SMP' | 'SMA' | 'SMK' | null
  division_code: string | null
  subject: string | null
  grade: number | null
  title: string
  slug: string
  author: string
  curriculum: string | null
  isbn: string | null
  synopsis: string | null
  target_market: string[]
  highlights: string[]
  price: number
  featured: boolean
  published: boolean
  image_path: string | null
  publication_year: number | null
  flyer_path: string | null
  product_knowledge_preview_path: string | null
  dummy_book_path: string | null
  product_knowledge_path: string | null
  created_at: string
  updated_at: string
}

export type EditorDatabase = {
  public: {
    Tables: {
      book_classifications: {
        Row: Classification & { position: number }
        Insert: Classification
        Update: never
        Relationships: []
      }
      products: {
        Row: BookRow
        Insert: Partial<BookRow> & Pick<BookRow, 'title' | 'slug'>
        Update: Partial<BookRow>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      delete_book_classification: {
        Args: { option_kind: string; option_code: string; option_level: string }
        Returns: boolean
      }
      featured_products_count: {
        Args: Record<never, never>
        Returns: number
      }
      set_featured_books: {
        Args: { selected_book_ids: string[] }
        Returns: number
      }
    }
  }
}
