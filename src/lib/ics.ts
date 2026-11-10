import { addDays, weekday } from "../scheduler";
import type { BlockRow } from "./blocks";

export const BREAK: [string, string] = ["2026-12-21", "2027-01-03"]; // Christmas break: no lectures
const END_OF_EXAMS = "2027-02-12";
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const pad = (n: number) => String(n).padStart(2, "0");

// Lagos is UTC+1 all year, so UTC = local - 1 hour.
const utc = (date: string, min: number) => {
  const [y, m, d] = date.split("-").map(Number);
  const z = new Date(Date.UTC(y, m - 1, d, 0, min - 60));
  return `${z.getUTCFullYear()}${pad(z.getUTCMonth() + 1)}${pad(z.getUTCDate())}T${pad(z.getUTCHours())}${pad(z.getUTCMinutes())}00Z`;
};
const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

export function buildIcs(rows: BlockRow[], today: string, alarmMin = 15): string {
  const L = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//400L Planner//EN", "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:400L Planner", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const r of rows) {
    const ev = ["BEGIN:VEVENT", `UID:${r.id}@planner400`, `DTSTAMP:${utc(today, 0)}`, `SUMMARY:${esc(r.title)}`];
    if (r.location) ev.push(`LOCATION:${esc(r.location)}`);

    if (r.on_date) {
      ev.push(`DTSTART:${utc(r.on_date, r.start_min)}`, `DTEND:${utc(r.on_date, r.end_min)}`);
    } else {
      const days = r.weekdays ?? [];
      const until = r.valid_until ?? END_OF_EXAMS;
      let first = r.valid_from && r.valid_from > addDays(today, -14) ? r.valid_from : addDays(today, -14);
      for (let i = 0; i < 7 && !days.includes(weekday(first)); i++) first = addDays(first, 1);
      if (!days.length || first > until) continue;
      ev.push(
        `DTSTART:${utc(first, r.start_min)}`,
        `DTEND:${utc(first, r.end_min)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(",")};UNTIL=${utc(until, 1439)}`
      );
      if (r.category === "class" || r.category === "read") {
        const ex: string[] = [];
        for (let d = BREAK[0]; d <= BREAK[1]; d = addDays(d, 1)) {
          if (d >= first && d <= until && days.includes(weekday(d))) ex.push(utc(d, r.start_min));
        }
        if (ex.length) ev.push(`EXDATE:${ex.join(",")}`);
      }
    }
    ev.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(r.title)}`, `TRIGGER:-PT${alarmMin}M`, "END:VALARM", "END:VEVENT");
    L.push(...ev);
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n");
}
