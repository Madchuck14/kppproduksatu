import { z } from 'zod'

export const divisionCodeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export type DivisionCode = z.infer<typeof divisionCodeSchema>

export const bookDivisions = [
  { code: 'sd-1-mipa', name: 'SD 1 MIPA', icon: 'i-lucide-flask-conical', style: 'division-mipa' },
  { code: 'sd-2-ips-bhs', name: 'SD 2 IPS BHS', icon: 'i-lucide-globe-2', style: 'division-ips' },
  {
    code: 'smp-sma-mipa',
    name: 'SMP/SMA MIPA',
    icon: 'i-lucide-atom',
    style: 'division-secondary',
  },
  { code: 'smk', name: 'SMK', icon: 'i-lucide-settings-2', style: 'division-vocational' },
  { code: 'phibeta', name: 'PHIBETA', icon: 'i-lucide-book-open', style: 'division-phibeta' },
  { code: 'intelecto', name: 'INTELECTO', icon: 'i-lucide-brain', style: 'division-intelecto' },
] as const
