export interface AccountSession {
  id: string
  email?: string
  role: 'sales' | 'editor'
  isSuper: boolean
  educationLevels: Array<'SD' | 'SMP' | 'SMA' | 'SMK'>
}
