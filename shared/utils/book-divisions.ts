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

export const additionalDivisionIcons = [
  'i-lucide-library',
  'i-lucide-graduation-cap',
  'i-lucide-lightbulb',
  'i-lucide-compass',
  'i-lucide-palette',
  'i-lucide-leaf',
  'i-lucide-rocket',
  'i-lucide-telescope',
  'i-lucide-puzzle',
  'i-lucide-music',
  'i-lucide-languages',
  'i-lucide-calculator',
] as const

export const additionalDivisionStyles = [
  'division-teal',
  'division-coral',
  'division-indigo',
  'division-lime',
  'division-fuchsia',
  'division-sky',
  'division-amber',
  'division-slate',
] as const

// Stable pseudo-random choices keep SSR, hydration, and repeat visits consistent.
function appearanceIndex(code: string, salt: string, length: number) {
  let hash = 2166136261
  for (const character of `${salt}:${code}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return (hash >>> 0) % length
}

export function getDivisionAppearance(code: string) {
  const builtin = bookDivisions.find((division) => division.code === code)
  if (builtin) return { icon: builtin.icon, style: builtin.style }
  return {
    icon: additionalDivisionIcons[appearanceIndex(code, 'icon', additionalDivisionIcons.length)]!,
    style:
      additionalDivisionStyles[appearanceIndex(code, 'color', additionalDivisionStyles.length)]!,
  }
}
