import type { BookInput } from '../schemas/editor'
import type { AccountSession } from './account'
import type { DivisionCode } from '../utils/book-divisions'

export interface EditorBook extends Omit<BookInput, 'bookCode' | 'educationLevel' | 'highlights'> {
  highlights: string[]
  id: string
  slug: string
  /** Compatibility alias of synopsis; no separate database column. */
  description: string
  bookCode: string | null
  educationLevel: BookInput['educationLevel'] | null
  divisionCode: DivisionCode | null
  synopsis: string | null
  targetMarket: string[]
  imageUrl: string
  resources: { flyer: boolean; dummy: boolean; productKnowledge: boolean }
  presentationSlideCount: number
  updatedAt: string
}

export interface EditorDashboard {
  account: AccountSession
  books: EditorBook[]
  total: number
  page: number
  pageSize: number
  stats: { total: number; published: number; draft: number; incomplete: number }
}
