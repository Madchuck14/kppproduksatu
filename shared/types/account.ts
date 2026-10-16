export interface AccountSession {
  id: string
  email?: string
  role: 'editor'
  isSuper: boolean
  educationLevels: Array<'SD' | 'SMP' | 'SMA' | 'SMK'>
}
