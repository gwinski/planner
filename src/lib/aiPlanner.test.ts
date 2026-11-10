import { describe, it, expect } from "vitest";
import { suggestTaskSlots, parseNaturalLanguageTask, createPlannerId } from "./aiPlanner";
import type { Block, PlanConfig } from "../scheduler";

const cfg: PlanConfig = {
  today: "2026-11-10",
  nowMinutes: 600,
};

const blocks: Block[] = [
  { id: "class", title: "Class", start: 600, end: 840, weekdays: [1, 2, 3, 4, 5] },
  { id: "other", title: "Meeting", start: 1200, end: 1320, date: "2026-11-11" },
];

describe("suggestTaskSlots", () => {
  it("returns the best free slots for a task before the deadline", () => {
    const suggestions = suggestTaskSlots(
      { id: "t1", title: "Thesis draft", totalMinutes: 180, sessionMinutes: 60, deadline: "2026-11-15", deep: true },
      blocks,
      cfg
    );

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].date).toBeTruthy();
    expect(suggestions[0].reason.toLowerCase()).toContain("deep work");
  });

  it("prefers deep work windows and avoids conflicts", () => {
    const suggestions = suggestTaskSlots(
      { id: "t2", title: "Deep reading", totalMinutes: 120, sessionMinutes: 60, deadline: "2026-11-12", deep: true },
      blocks,
      cfg
    );

    expect(suggestions.some((s) => s.start >= 900 && s.start <= 1200)).toBe(true);
    expect(suggestions[0].reason).toMatch(/deep work|preferred/i);
  });
});

describe("parseNaturalLanguageTask", () => {
  it("extracts title, duration, session size, deadline and work style from a prompt", () => {
    const task = parseNaturalLanguageTask(
      "Plan 2 hours of thesis draft by Friday in 45 minute deep work sessions",
      "2026-11-10"
    );

    expect(task.title).toMatch(/thesis draft/i);
    expect(task.totalMinutes).toBe(120);
    expect(task.sessionMinutes).toBe(45);
    expect(task.deadline).toBe("2026-11-13");
    expect(task.deep).toBe(true);
  });

  it("creates a valid UUID for database inserts", () => {
    const id = createPlannerId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe("parser edge cases", () => {
  it("does not read 'months' as minutes", () => {
    const t = parseNaturalLanguageTask("Finish pump report in 2 months", "2026-11-10");
    expect(t.totalMinutes).toBe(60);
    expect(t.title).toBe("Finish pump report");
  });
  it("keeps total time and session length apart", () => {
    const t = parseNaturalLanguageTask("Study MEG 417 for 120 minutes in 45 minute sessions by 2026-11-20", "2026-11-10");
    expect(t.totalMinutes).toBe(120);
    expect(t.sessionMinutes).toBe(45);
    expect(t.deadline).toBe("2026-11-20");
    expect(t.title).toBe("Study MEG 417");
  });
});

describe("suggestions respect blackout dates", () => {
  it("never suggests a day inside the break", () => {
    const s = suggestTaskSlots(
      { id: "x", title: "T", totalMinutes: 60, sessionMinutes: 60, deadline: "2027-01-08", deep: true },
      [], { today: "2026-12-20", nowMinutes: 0, blackout: [["2026-12-21", "2027-01-03"]] }
    );
    expect(s.every((x) => x.date < "2026-12-21" || x.date > "2027-01-03")).toBe(true);
  });
});
