import type { EducationLevel } from './book-subjects'

export const gradesByLevel: Record<EducationLevel, readonly number[]> = {
  SD: [1, 2, 3, 4, 5, 6],
  SMP: [7, 8, 9],
  SMA: [10, 11, 12],
  SMK: [10, 11, 12],
}

export function getGradesForLevel(level: string | null | undefined): readonly number[] {
  return level && Object.hasOwn(gradesByLevel, level) ? gradesByLevel[level as EducationLevel] : []
}
