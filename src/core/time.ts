export const MINUTES_PER_DAY = 1_440;
export const DAYS_PER_MONTH = 30;
export const MINUTES_PER_MONTH = MINUTES_PER_DAY * DAYS_PER_MONTH;

export type CalendarTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  absoluteDay: number;
  absoluteMonth: number;
};

export function calendarFromMinutes(totalMinutes: number): CalendarTime {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const absoluteDay = Math.floor(safeMinutes / MINUTES_PER_DAY);
  const absoluteMonth = Math.floor(absoluteDay / DAYS_PER_MONTH);
  const minuteOfDay = safeMinutes % MINUTES_PER_DAY;
  return {
    year: Math.floor(absoluteMonth / 12) + 1,
    month: (absoluteMonth % 12) + 1,
    day: (absoluteDay % DAYS_PER_MONTH) + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    absoluteDay,
    absoluteMonth,
  };
}

export function formatDate(totalMinutes: number): string {
  const time = calendarFromMinutes(totalMinutes);
  return `Y${time.year} · M${time.month} · D${time.day}`;
}

export function formatClock(totalMinutes: number): string {
  const time = calendarFromMinutes(totalMinutes);
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

export function isNight(totalMinutes: number): boolean {
  const hour = calendarFromMinutes(totalMinutes).hour;
  return hour < 6 || hour >= 19;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "ready";
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}
