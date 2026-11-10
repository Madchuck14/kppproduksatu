export type AccountDatabase = {
  public: {
    Tables: {
      account_memberships: {
        Row: {
          user_id: string
          role: 'sales' | 'editor'
          is_super: boolean
          sales_areas: string[]
          created_at: string
        }
        Insert: never
        Update: { sales_areas: string[] }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
  }
}
