// Runtime rows are also validated in the repository. Keep this write contract aligned
// with the catalog migrations until generated database types replace it.
type BookRow = {
  id: string
  book_code: string | null
  education_level: 'SD' | 'SMP' | 'SMA' | 'SMK' | null
  subject: string | null
  title: string
  slug: string
  author: string
  description: string
  price: number
  featured: boolean
  published: boolean
  image_path: string | null
  publication_year: number | null
  flyer_path: string | null
  dummy_book_path: string | null
  product_knowledge_path: string | null
  created_at: string
  updated_at: string
}

export type EditorDatabase = {
  public: {
    Tables: {
      products: {
        Row: BookRow
        Insert: Partial<BookRow> & Pick<BookRow, 'title' | 'slug'>
        Update: Partial<BookRow>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
  }
}
