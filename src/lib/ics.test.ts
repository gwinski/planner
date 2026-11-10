import { describe, it, expect } from "vitest";
import { buildIcs } from "./ics";
import type { BlockRow } from "./blocks";

const row = (over: Partial<BlockRow>): BlockRow => ({
  id: "a", title: "MEG 412", category: "class", start_min: 600, end_min: 720, weekdays: [1], on_date: null,
  valid_from: null, valid_until: "2027-01-15", done: false, task_id: null, part: null, of_parts: null,
  deadline: null, deep: null, location: "Room 277", ...over,
});

describe("buildIcs", () => {
  it("makes a weekly event with UTC times, an end date and the Christmas break excluded", () => {
    const ics = buildIcs([row({})], "2026-11-10");
    expect(ics).toContain("DTSTART:20261102T090000Z");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20270115T225900Z");
    expect(ics).toContain("EXDATE:20261221T090000Z,20261228T090000Z");
    expect(ics).toContain("TRIGGER:-PT15M");
  });

  it("makes a single event for a dated task session, with no repeat", () => {
    const ics = buildIcs([row({ id: "b", category: "proj", weekdays: null, on_date: "2026-11-12" })], "2026-11-10");
    expect(ics).toContain("DTSTART:20261112T090000Z");
    expect(ics).not.toContain("RRULE");
  });
});
