import { addDays, blocksOn, weekday, type Block, type PlanConfig } from "../scheduler";

export type AiSuggestion = {
  date: string;
  start: number;
  end: number;
  score: number;
  reason: string;
};

export type AiTaskInput = {
  id: string;
  title: string;
  totalMinutes: number;
  sessionMinutes: number;
  deadline: string;
  deep: boolean;
};

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const nextWeekdayDate = (today: string, name: string): string => {
  const target = DAY_NAMES.indexOf(name.toLowerCase());
  if (target === -1) return addDays(today, 7);
  const current = weekday(today);
  const diff = (target - current + 7) % 7 || 7;
  return addDays(today, diff);
};

export function createPlannerId(prefix?: string) {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== "undefined" && "getRandomValues" in globalThis.crypto) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  const uuid = [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");

  return prefix ? `${prefix}-${uuid}` : uuid;
}

export function parseNaturalLanguageTask(input: string, today: string) {
  const text = input.trim();
  if (!text) {
    return { title: "New task", totalMinutes: 60, sessionMinutes: 60, deadline: addDays(today, 7), deep: true };
  }
  const lower = text.toLowerCase();

  // "45 minute (deep work) sessions": the session length, kept separate from the total time
  const sessionRe = /(\d+)\s*(?:minutes?|mins?)\b(?:\s+\w+){0,2}?\s+sessions?/i;
  const sessionMatch = lower.match(sessionRe);
  const rest = lower.replace(sessionRe, " ");

  const hours = rest.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const mins = rest.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i);
  const totalMinutes = hours ? Math.round(Number(hours[1]) * 60) : mins ? Math.round(Number(mins[1])) : 60;
  const sessionMinutes = sessionMatch ? Number(sessionMatch[1]) : Math.min(totalMinutes, 60);

  const deadline = (() => {
    const explicit = text.match(/\b(?:by|before|due|on)\s*(\d{4}-\d{2}-\d{2})\b/i)?.[1];
    if (explicit) return explicit;
    const rel = lower.match(/\bin\s+(\d+)\s*(days?|weeks?)\b/);
    if (rel) return addDays(today, Number(rel[1]) * (rel[2].startsWith("w") ? 7 : 1));
    const dayMatch =
      text.match(/\b(?:by|before|due|on)\s*(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1] ??
      text.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[0];
    if (dayMatch) {
      if (/today/i.test(dayMatch)) return today;
      if (/tomorrow/i.test(dayMatch)) return addDays(today, 1);
      return nextWeekdayDate(today, dayMatch);
    }
    return addDays(today, 7);
  })();

  const titleSeed = text
    .replace(/^(plan|schedule|create|make|add|task|work on|focus on)\s+/i, "")
    .replace(sessionRe, " ")
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    .replace(/\bin\s+\d+\s*(?:days?|weeks?|months?)\b/gi, " ")
    .replace(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi, " ")
    .replace(/\b(by|before|due|on|in|for|around|with|and|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|deep|light|focus|work|session|sessions|minutes|min|hours|hrs|day|days|week)\b/gi, " ")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const deep = /deep|focus|research|design|draft|write|coding|study|analysis|prototype|cad|simulation|report|assignment|project/i.test(lower) && !/light|review|read|check|admin/i.test(lower);
  return { title: titleSeed || "New task", totalMinutes, sessionMinutes, deadline, deep };
}

export function suggestTaskSlots(task: AiTaskInput, blocks: Block[], cfg: PlanConfig): AiSuggestion[] {
  const c = { ...cfg, dayStart: cfg.dayStart ?? 420, dayEnd: cfg.dayEnd ?? 1320, deadlineDayEnd: cfg.deadlineDayEnd ?? 1080, step: cfg.step ?? 15, buffer: cfg.buffer ?? 10 };
  const preferredStart = task.deep ? 990 : 1170;
  const deadline = task.deadline || addDays(c.today, 7);
  const candidates: AiSuggestion[] = [];

  for (let d = c.today; d <= deadline; d = addDays(d, 1)) {
    if ((c.blackout ?? []).some(([x, y]) => d >= x && d <= y)) continue;
    const dayBlocks = blocksOn(blocks, d);
    const dayLoad = dayBlocks.reduce((sum, b) => sum + (b.end - b.start), 0) / 60;
    const isDeadline = d === deadline;
    const limit = isDeadline ? c.deadlineDayEnd : c.dayEnd;
    const isToday = d === c.today;

    for (let start = c.dayStart; start + task.sessionMinutes <= limit; start += c.step) {
      if (isToday && start < c.nowMinutes + 15) continue;
      const end = start + task.sessionMinutes;
      if (dayBlocks.some((b) => start < b.end + c.buffer && end + c.buffer > b.start)) continue;

      const score =
        Math.abs(start - preferredStart) / 60 +
        dayLoad * 0.4 +
        (isDeadline ? 1.5 : 0) +
        (d === c.today ? 0.25 : 0);

      const n = dayBlocks.length;
      const reason = `${task.deep ? "Near your deep work window (late afternoon)" : "Near your light task window (evening)"}; ${n} other block${n === 1 ? "" : "s"} that day${isDeadline ? ", deadline day (done by 6pm)" : ""}.`;

      candidates.push({ date: d, start, end, score, reason });
    }
  }

  return candidates.sort((a, b) => a.score - b.score).slice(0, 3);
}
