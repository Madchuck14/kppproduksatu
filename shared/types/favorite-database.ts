import type { EditorDatabase } from './editor-database'

type FavoriteRow = { user_id: string; product_id: string; created_at: string }

export type FavoriteDatabase = {
  public: Omit<EditorDatabase['public'], 'Tables'> & {
    Tables: EditorDatabase['public']['Tables'] & {
      product_favorites: {
        Row: FavoriteRow
        Insert: Pick<FavoriteRow, 'user_id' | 'product_id'> & { created_at?: string }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'product_favorites_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
    }
  }
}
