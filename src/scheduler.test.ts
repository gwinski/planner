import { describe, it, expect } from "vitest";
import { planTask, replanMissed, splitSessions, blocksOn, type Block, type PlanConfig, type Task } from "./scheduler";

// 2026-11-10 is a Tuesday.
const cfg: PlanConfig = { today: "2026-11-10", nowMinutes: 600 };
const classes: Block = { id: "c1", title: "Class", start: 600, end: 840, weekdays: [1, 2, 3, 4, 5] };

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Pump casing",
  totalMinutes: 240,
  sessionMinutes: 60,
  deadline: "2026-11-20",
  deep: true,
  ...over,
});

describe("splitSessions", () => {
  it("splits evenly", () => expect(splitSessions(240, 60)).toEqual([60, 60, 60, 60]));
  it("keeps the remainder as a shorter last session", () => expect(splitSessions(250, 60)).toEqual([60, 60, 60, 60, 10]));
  it("ignores invalid session lengths", () => {
    expect(splitSessions(240, 0)).toEqual([]);
    expect(splitSessions(240, -30)).toEqual([]);
    expect(splitSessions(-240, 60)).toEqual([]);
  });

  it("uses safe defaults for invalid scheduling config", () => {
    const r = planTask(task({ totalMinutes: 240 }), [], { ...cfg, step: 0, dayStart: 1500, dayEnd: 1200, deadlineDayEnd: 0, buffer: -5 });
    expect(r.missed).toBe(0);
    expect(r.placed).toHaveLength(4);
  });
});

describe("blocksOn", () => {
  it("matches recurring blocks by weekday and ignores done blocks", () => {
    expect(blocksOn([classes], "2026-11-10")).toHaveLength(1); // Tuesday
    expect(blocksOn([classes], "2026-11-14")).toHaveLength(0); // Saturday
    expect(blocksOn([{ ...classes, done: true }], "2026-11-10")).toHaveLength(0);
  });
});

describe("planTask", () => {
  it("places every session and never overlaps fixed blocks (with buffer)", () => {
    const r = planTask(task(), [classes], cfg);
    expect(r.missed).toBe(0);
    expect(r.placed).toHaveLength(4);
    for (const p of r.placed) {
      for (const c of blocksOn([classes], p.date!)) {
        expect(p.start < c.end + 10 && p.end + 10 > c.start).toBe(false);
      }
    }
  });

  it("keeps everything on or before the deadline, finishing by 18:00 on the deadline day", () => {
    const r = planTask(task({ deadline: "2026-11-13" }), [classes], cfg);
    for (const p of r.placed) {
      expect(p.date! <= "2026-11-13").toBe(true);
      if (p.date === "2026-11-13") expect(p.end).toBeLessThanOrEqual(1080);
    }
  });

  it("spreads sessions over several days", () => {
    const r = planTask(task(), [classes], cfg);
    expect(new Set(r.placed.map((p) => p.date)).size).toBeGreaterThanOrEqual(3);
  });

  it("never places sessions inside a blackout range", () => {
    const c: PlanConfig = { today: "2026-12-15", nowMinutes: 600, blackout: [["2026-12-21", "2027-01-03"]] };
    const r = planTask(task({ totalMinutes: 360, deadline: "2027-01-08" }), [], c);
    expect(r.missed).toBe(0);
    for (const p of r.placed) expect(p.date! >= "2026-12-21" && p.date! <= "2027-01-03").toBe(false);
  });

  it("reports sessions that do not fit", () => {
    const c: PlanConfig = { today: "2026-11-10", nowMinutes: 1000 };
    const r = planTask(task({ totalMinutes: 600, deadline: "2026-11-10" }), [], c);
    expect(r.placed).toHaveLength(1);
    expect(r.missed).toBe(9);
  });

  it("misses everything when the deadline is already in the past", () => {
    const r = planTask(task({ deadline: "2026-11-01" }), [], cfg);
    expect(r.placed).toHaveLength(0);
    expect(r.missed).toBe(4);
  });
});

describe("replanMissed", () => {
  const mk = (part: number, date: string, done = false): Block => ({
    id: `t1-s${part}`,
    title: `Pump casing (${part}/3)`,
    start: 1000,
    end: 1060,
    date,
    done,
    taskId: "t1",
    part,
    of: 3,
    deadline: "2026-11-16",
    deep: true,
  });

  it("moves missed sessions forward and leaves done ones alone", () => {
    const blocks = [mk(1, "2026-11-09"), mk(2, "2026-11-09", true), mk(3, "2026-11-14")];
    const r = replanMissed(blocks, cfg);
    expect(r.replaced).toBe(1);
    expect(r.lost).toBe(0);
    const t1 = r.blocks.filter((b) => b.taskId === "t1");
    expect(t1).toHaveLength(3);
    expect(r.blocks.find((b) => b.id === "t1-s2")?.date).toBe("2026-11-09");
    for (const b of t1.filter((x) => !x.done)) {
      expect(b.date! >= "2026-11-10" && b.date! <= "2026-11-16").toBe(true);
    }
  });

  it("does nothing when nothing is missed", () => {
    const blocks = [mk(1, "2026-11-14")];
    const r = replanMissed(blocks, cfg);
    expect(r.replaced).toBe(0);
    expect(r.blocks).toBe(blocks);
  });
});
