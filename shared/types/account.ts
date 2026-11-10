export interface AccountSession {
  id: string
  nip?: string
  email?: string
  role: 'sales' | 'editor'
  isSuper: boolean
  educationLevels: Array<'SD' | 'SMP' | 'SMA' | 'SMK'>
  salesAreas?: string[]
}
