// Pure scheduling logic: no Date.now(), no browser APIs, so it is easy to test.
// Dates are "YYYY-MM-DD" strings. Times are minutes since midnight (600 = 10:00).

export type Block = {
  id: string;
  title: string;
  start: number;
  end: number;
  weekdays?: number[]; // recurring: 0=Sun ... 6=Sat
  date?: string; // one-off: "YYYY-MM-DD"
  validFrom?: string;
  validUntil?: string;
  skip?: [string, string][];
  done?: boolean;
  // task-session fields
  taskId?: string;
  part?: number;
  of?: number;
  deadline?: string;
  deep?: boolean;
};

export type Task = {
  id: string;
  title: string;
  totalMinutes: number;
  sessionMinutes: number;
  deadline: string;
  deep: boolean;
};

export type PlanConfig = {
  today: string;
  nowMinutes: number;
  blackout?: [string, string][]; // inclusive date ranges where no session may be placed
  dayStart?: number; // earliest start, default 07:00
  dayEnd?: number; // latest finish, default 22:00
  deadlineDayEnd?: number; // latest finish on the deadline day, default 18:00
  buffer?: number; // gap kept around other blocks, default 10 min
  step?: number; // slot granularity, default 15 min
};

type Session = { dur: number; part: number; of: number };
type Meta = { id: string; title: string; deadline: string; deep: boolean };

// ---------- date helpers ----------
const toDate = (s: string) => new Date(s + "T00:00:00Z");
export const toIso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};
export const weekday = (s: string) => toDate(s).getUTCDay();

const positiveNumber = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
};

function resolve(cfg: PlanConfig) {
  const dayStart = positiveNumber(cfg.dayStart, 420);
  const dayEnd = positiveNumber(cfg.dayEnd, 1320);
  const deadlineDayEnd = positiveNumber(cfg.deadlineDayEnd, 1080);
  const buffer = typeof cfg.buffer === "number" && Number.isFinite(cfg.buffer) && cfg.buffer >= 0 ? cfg.buffer : 10;
  const step = positiveNumber(cfg.step, 15);

  return {
    today: cfg.today,
    nowMinutes: typeof cfg.nowMinutes === "number" && Number.isFinite(cfg.nowMinutes) ? cfg.nowMinutes : 0,
    blackout: Array.isArray(cfg.blackout) ? cfg.blackout : [],
    dayStart: dayStart < dayEnd ? dayStart : 420,
    dayEnd: dayEnd > dayStart ? dayEnd : 1320,
    deadlineDayEnd: deadlineDayEnd > dayStart ? deadlineDayEnd : 1080,
    buffer,
    step,
  } as const;
}

const inBlackout = (d: string, ranges: [string, string][]) =>
  ranges.some(([a, b]) => d >= a && d <= b);

// ---------- core ----------
export function blocksOn(blocks: Block[], date: string): Block[] {
  const wd = weekday(date);
  return blocks.filter(
    (b) =>
      !b.done &&
      (b.date
        ? b.date === date
        : (b.weekdays ?? []).includes(wd) &&
          (!b.validFrom || date >= b.validFrom) &&
          (!b.validUntil || date <= b.validUntil))
  );
}

export function splitSessions(totalMinutes: number, sessionMinutes: number): number[] {
  const total = Math.round(totalMinutes);
  const session = Math.round(sessionMinutes);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(session) || session <= 0) {
    return [];
  }

  const out: number[] = [];
  let rem = total;
  while (rem > 0) {
    const d = Math.min(session, rem);
    out.push(d);
    rem -= d;
  }
  return out;
}

function placeSessions(
  meta: Meta,
  sessions: Session[],
  blocks: Block[],
  cfgIn: PlanConfig
): { placed: Block[]; missed: number } {
  const c = resolve(cfgIn);
  const work = [...blocks];
  const placed: Block[] = [];
  let missed = 0;

  const days: string[] = [];
  for (let d = c.today; d <= meta.deadline; d = addDays(d, 1)) {
    if (!inBlackout(d, c.blackout)) days.push(d);
  }
  const centre = meta.deep ? 990 : 1170; // 16:30 for deep work, 19:30 for light work

  for (const s of sessions) {
    let best: { score: number; start: number; date: string } | null = null;

    days.forEach((date, di) => {
      const L = blocksOn(work, date);
      const load = L.reduce((a, b) => a + (b.end - b.start), 0) / 60;
      const same = L.filter((b) => b.taskId === meta.id).length;
      const isDeadline = date === meta.deadline;
      const limit = isDeadline ? c.deadlineDayEnd : c.dayEnd;
      const isToday = date === c.today;

      for (let start = c.dayStart; start + s.dur <= limit; start += c.step) {
        if (isToday && start < c.nowMinutes + 15) continue;
        if (L.some((b) => start < b.end + c.buffer && start + s.dur + c.buffer > b.start)) continue;
        const score =
          Math.abs(start - centre) / 60 + // closeness to preferred time
          load * 0.4 + // avoid busy days
          same * 3 + // spread a task's sessions across days
          (isDeadline ? 1.5 : 0) + // keep slack before the deadline
          di * 0.25; // mild preference for earlier days
        if (!best || score < best.score) best = { score, start, date };
      }
    });

    if (!best) {
      missed++;
      continue;
    }
    const b = best as { score: number; start: number; date: string };
    const block: Block = {
      id: `${meta.id}-s${s.part}`,
      title: `${meta.title} (${s.part}/${s.of})`,
      start: b.start,
      end: b.start + s.dur,
      date: b.date,
      taskId: meta.id,
      part: s.part,
      of: s.of,
      deadline: meta.deadline,
      deep: meta.deep,
    };
    work.push(block);
    placed.push(block);
  }
  return { placed, missed };
}

export function planTask(task: Task, blocks: Block[], cfg: PlanConfig) {
  const durs = splitSessions(task.totalMinutes, task.sessionMinutes);
  const sessions = durs.map((dur, i) => ({ dur, part: i + 1, of: durs.length }));
  return placeSessions(
    { id: task.id, title: task.title, deadline: task.deadline, deep: task.deep },
    sessions,
    blocks,
    cfg
  );
}

export function replanMissed(blocks: Block[], cfgIn: PlanConfig) {
  const c = resolve(cfgIn);
  const isMissed = (b: Block) =>
    !!b.taskId &&
    !b.done &&
    !!b.date &&
    (b.date < c.today || (b.date === c.today && b.end <= c.nowMinutes));

  const missedBlocks = blocks.filter(isMissed);
  if (!missedBlocks.length) return { blocks, replaced: 0, lost: 0 };

  let work = blocks.filter((b) => !missedBlocks.includes(b));
  let lost = 0;

  const byTask = new Map<string, Block[]>();
  for (const b of missedBlocks) {
    byTask.set(b.taskId!, [...(byTask.get(b.taskId!) ?? []), b]);
  }

  for (const [taskId, list] of byTask) {
    const f = list[0];
    // If the deadline has already passed, give the leftovers two extra days.
    const deadline = f.deadline && f.deadline >= c.today ? f.deadline : addDays(c.today, 2);
    const sessions = list.map((b) => ({ dur: b.end - b.start, part: b.part ?? 1, of: b.of ?? list.length }));
    const title = f.title.replace(/\s*\(\d+\/\d+\)$/, "");
    const r = placeSessions({ id: taskId, title, deadline, deep: !!f.deep }, sessions, work, cfgIn);
    work = [...work, ...r.placed];
    lost += r.missed;
  }
  return { blocks: work, replaced: missedBlocks.length - lost, lost };
}
