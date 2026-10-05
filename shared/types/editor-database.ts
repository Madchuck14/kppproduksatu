// Runtime rows are also validated in the repository. Keep this write contract aligned
// with the catalog migrations until generated database types replace it.
type BookRow = {
  id: string
  book_code: string | null
  education_level: 'SD' | 'SMP' | 'SMA' | 'SMK' | null
  title: string
  slug: string
  author: string
  description: string
  price: number
  category_id: string | null
  featured: boolean
  published: boolean
  image_path: string | null
  created_at: string
  updated_at: string
}

type CategoryRow = { id: string; name: string; slug: string; created_at: string }

export type EditorDatabase = {
  public: {
    Tables: {
      products: {
        Row: BookRow
        Insert: Partial<BookRow> & Pick<BookRow, 'title' | 'slug'>
        Update: Partial<BookRow>
        Relationships: []
      }
      categories: {
        Row: CategoryRow
        Insert: Partial<CategoryRow> & Pick<CategoryRow, 'name' | 'slug'>
        Update: Partial<CategoryRow>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
  }
}
