import type { BookInput } from '../schemas/editor'
import type { AccountSession } from './account'

export interface EditorBook extends Omit<BookInput, 'bookCode' | 'educationLevel'> {
  id: string
  bookCode: string | null
  educationLevel: BookInput['educationLevel'] | null
  imageUrl: string
  updatedAt: string
}

export interface EditorDashboard {
  account: AccountSession
  books: EditorBook[]
  categories: { id: string; name: string }[]
  total: number
  page: number
  pageSize: number
  stats: { total: number; published: number; draft: number; incomplete: number }
}
