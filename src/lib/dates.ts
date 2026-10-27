// Months as the dashboard names them: "YYYY-MM".

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "2026-08" as "August 2026". */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-')
  return `${MONTHS[Number(month) - 1]} ${year}`
}

/** This month and the `count - 1` before it, newest first, as "YYYY-MM". */
export function recentMonths(now = new Date(), count = 24): string[] {
  const months: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

/** The month before this one: the month a return is usually made for. */
export function lastMonth(now = new Date()): string {
  return recentMonths(now, 2)[1]
}
