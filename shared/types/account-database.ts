import type { SalesDashboard } from '../schemas/sales-dashboard'

export type AccountDatabase = {
  public: {
    Tables: {
      employee_registry: {
        Row: {
          nip: string
          user_id: string | null
          role: 'sales' | 'editor'
          education_level: 'SD' | 'SMP' | 'SMA' | 'SMK' | null
          name: string | null
          work_area: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
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
    Functions: {
      record_sales_login: {
        Args: { p_user_id: string; p_session_id: string }
        Returns: undefined
      }
      get_sales_dashboard: {
        Args: { p_page: number }
        Returns: SalesDashboard
      }
    }
  }
}
