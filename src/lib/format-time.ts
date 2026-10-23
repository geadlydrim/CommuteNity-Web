/**
 * Post timestamps, always in Philippine time with a fixed locale, so the
 * server renders the same text for every rider regardless of where the server
 * or the browser runs.
 */

const TIME_ZONE = "Asia/Manila";
const LOCALE = "en-PH";

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const monthDayFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
});
const fullDateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});
const calendarFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** The Manila calendar day of an instant. */
function manilaDay(date: Date): { year: string; day: string } {
  let year = "";
  let month = "";
  let day = "";
  for (const part of calendarFormat.formatToParts(date)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return { year, day: `${year}-${month}-${day}` };
}

/**
 * Today (in Manila) → time, e.g. "9:05 AM"; earlier this year → "Oct 9";
 * an earlier year → "Oct 9, 2025".
 */
export function formatPostTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const posted = manilaDay(date);
  const today = manilaDay(now);
  if (posted.day === today.day) return timeFormat.format(date);
  if (posted.year === today.year) return monthDayFormat.format(date);
  return fullDateFormat.format(date);
}
