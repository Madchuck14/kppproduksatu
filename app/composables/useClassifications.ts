import { bookDivisions } from '#shared/utils/book-divisions'

export async function useClassifications() {
  const { data, error, refresh, status } = await useFetch('/api/catalog/classifications', {
    key: 'book-classifications',
  })
  const divisions = computed(() =>
    (data.value ?? [])
      .filter((item) => item.kind === 'division')
      .map((item) => ({
        code: item.code,
        name: item.name,
        icon:
          bookDivisions.find((division) => division.code === item.code)?.icon ??
          'i-lucide-book-open',
        style:
          bookDivisions.find((division) => division.code === item.code)?.style ??
          'division-vocational',
      })),
  )
  const curricula = computed(() =>
    (data.value ?? []).filter((item) => item.kind === 'curriculum').map((item) => item.name),
  )
  function subjectsForLevel(level?: string | null) {
    return [
      ...new Set(
        (data.value ?? [])
          .filter((item) => item.kind === 'subject' && (!level || item.education_level === level))
          .map((item) => item.name),
      ),
    ]
  }
  return { data, error, refresh, status, divisions, curricula, subjectsForLevel }
}
