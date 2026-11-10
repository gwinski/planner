"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SEED, REVISION } from "@/lib/seed";
import { fromRow, hm, type BlockRow } from "@/lib/blocks";
import { suggestTaskSlots, parseNaturalLanguageTask, createPlannerId, type AiSuggestion } from "@/lib/aiPlanner";
import { blocksOn, planTask, replanMissed, addDays, type Block, type PlanConfig } from "@/scheduler";

const COLORS: Record<string, string> = { class: "#2f4f8f", read: "#c98a12", work: "#1f8a8a", proj: "#7a4fb5", vol: "#3d8b4f", life: "#8a8f98", task: "#c4476b" };
const CATS = [["proj", "Project"], ["work", "Work"], ["vol", "Volunteer"], ["read", "Study"], ["life", "Personal"]];
const DN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BLACKOUT: [string, string][] = [["2026-12-21", "2027-01-03"]]; // Christmas break
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const cfg = (): PlanConfig => {
  const n = new Date();
  return { today: iso(n), nowMinutes: n.getHours() * 60 + n.getMinutes(), blackout: BLACKOUT };
};
const toInsert = (b: Block, category: string) => ({
  title: b.title, category, start_min: b.start, end_min: b.end, on_date: b.date,
  task_id: b.taskId, part: b.part, of_parts: b.of, deadline: b.deadline, deep: b.deep,
});

const field: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #2e3441", background: "#1c2029", color: "#e8eaf0", fontSize: 14 };
const btn: React.CSSProperties = { ...field, background: "#8fb0ee", color: "#14171d", border: 0, cursor: "pointer" };
const card: React.CSSProperties = { background: "#1c2029", border: "1px solid #2e3441", borderRadius: 12, padding: 12, marginBottom: 12 };

export default function Planner() {
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [chat, setChat] = useState("");
  const [ai, setAi] = useState<AiSuggestion[]>([]);
  const [f, setF] = useState({ title: "", hours: "4", deadline: "", session: "60", deep: true, category: "proj" });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("blocks").select("*");
    if (error) setMsg("Could not load: " + error.message);
    else setRows(data as BlockRow[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const blocks = rows.map(fromRow);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const [ed, setEd] = useState({ title: "", s: "", e: "" });
  useEffect(() => {
    const r = sel ? byId.get(sel) : null;
    if (r) setEd({ title: r.title, s: hm(r.start_min), e: hm(r.end_min) });
  }, [sel]);
  const mins = (s: string) => { const [a, b] = s.split(":"); return +a * 60 + +b; };

  async function saveEdit(id: string) {
    const s = mins(ed.s), e = mins(ed.e);
    if (!(e > s)) return setMsg("End time must be after the start time.");
    const { error } = await supabase.from("blocks").update({ title: ed.title, start_min: s, end_min: e }).eq("id", id);
    setMsg(error ? error.message : "Saved.");
    setSel(null); load();
  }
  async function addRevision() {
    const { error } = await supabase.from("blocks").insert(REVISION);
    setMsg(error ? error.message : "Exam-period revision blocks added (Jan 18 to Feb 12).");
    load();
  }

  async function seed() {
    const { error } = await supabase.from("blocks").insert(SEED);
    setMsg(error ? "Could not save: " + error.message : "Timetable saved.");
    load();
  }

  async function plan() {
    const c = cfg();
    const title = f.title.trim() || "New task";
    const deadline = f.deadline || addDays(c.today, 7);
    if (deadline < c.today) return setMsg("That deadline is in the past. Check the year.");
    const total = Math.round(parseFloat(f.hours) * 60) || 60;
    const { data: t, error } = await supabase.from("tasks")
      .insert({ title, total_minutes: total, session_minutes: +f.session, deadline, deep: f.deep, category: f.category })
      .select().single();
    if (error || !t) return setMsg(error?.message ?? "Could not save the task.");
    const r = planTask({ id: t.id, title, totalMinutes: total, sessionMinutes: +f.session, deadline, deep: f.deep }, blocks, c);
    if (r.placed.length) {
      const { error: e2 } = await supabase.from("blocks").insert(r.placed.map((b) => toInsert(b, f.category)));
      if (e2) return setMsg(e2.message);
    } else await supabase.from("tasks").delete().eq("id", t.id);
    setMsg(r.missed
      ? `Placed ${r.placed.length} of ${r.placed.length + r.missed} sessions. ${r.missed} did not fit before ${deadline}.`
      : `Planned ${r.placed.length} session(s) before ${deadline}.`);
    load();
  }

  async function replan() {
    const r = replanMissed(blocks, cfg());
    if (!r.replaced && !r.lost) return setMsg("Nothing missed.");
    const oldIds = new Set(blocks.map((b) => b.id));
    const gone = blocks.filter((b) => !r.blocks.some((x) => x.id === b.id)).map((b) => b.id);
    const fresh = r.blocks.filter((b) => !oldIds.has(b.id));
    if (gone.length) await supabase.from("blocks").delete().in("id", gone);
    if (fresh.length) await supabase.from("blocks").insert(fresh.map((b) => toInsert(b, rows.find((x) => x.task_id === b.taskId)?.category ?? "task")));
    setMsg(`Re-planned ${r.replaced} session(s)${r.lost ? `, ${r.lost} no longer fit` : ""}.`);
    load();
  }

  function suggestAI() {
    const c = cfg();
    const title = f.title.trim() || "New task";
    const deadline = f.deadline || addDays(c.today, 7);
    const total = Math.round(parseFloat(f.hours) * 60) || 60;
    const suggestions = suggestTaskSlots({
      id: "ai-suggest",
      title,
      totalMinutes: total,
      sessionMinutes: +f.session,
      deadline,
      deep: f.deep,
    }, blocks, c);
    setAi(suggestions);
    if (!suggestions.length) setMsg("No good session remains in this window.");
  }

  async function chatTask() {
    const input = chat.trim();
    if (!input) return setMsg("Type a task request first.");
    const parsed = parseNaturalLanguageTask(input, cfg().today);
    const title = parsed.title || "New task";
    const total = parsed.totalMinutes || 60;
    const session = parsed.sessionMinutes || 60;
    const deadline = parsed.deadline || addDays(cfg().today, 7);
    const c = cfg();
    const taskId = createPlannerId();
    const task = { id: taskId, title, totalMinutes: total, sessionMinutes: session, deadline, deep: parsed.deep };
    const r = planTask(task, blocks, c);
    const { data: t, error } = await supabase.from("tasks")
      .insert({ id: taskId, title, total_minutes: total, session_minutes: session, deadline, deep: task.deep, category: "proj" })
      .select().single();
    if (error || !t) return setMsg(error?.message ?? "Could not save the task.");

    if (r.placed.length) {
      const { error: e2 } = await supabase.from("blocks").insert(r.placed.map((b) => toInsert(b, "proj")));
      if (e2) return setMsg(e2.message);
    } else await supabase.from("tasks").delete().eq("id", taskId);
    setMsg(r.missed
      ? `Created “${title}” and planned ${r.placed.length} of ${r.placed.length + r.missed} sessions before ${deadline}.`
      : `Created “${title}” and planned ${r.placed.length} session(s) before ${deadline}.`);
    setChat("");
    setAi(suggestTaskSlots(task, blocks, c));
    load();
  }

  async function toggleDone(id: string) {
    await supabase.from("blocks").update({ done: !byId.get(id)?.done }).eq("id", id);
    setSel(null); load();
  }
  async function remove(id: string) {
    await supabase.from("blocks").delete().eq("id", id);
    setSel(null); load();
  }

  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  const picked = sel ? byId.get(sel) : null;
  const upd = (k: string, v: string | boolean) => setF({ ...f, [k]: v });

  return (
    <div>
      {rows.length === 0 && <div style={card}><button style={btn} onClick={seed}>Load my timetable</button></div>}

      <div style={card}>
        <b>Add a task with a deadline</b>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input style={{ ...field, flex: 1, minWidth: 160 }} placeholder="Task (e.g. Pump volute CAD)" value={f.title} onChange={(e) => upd("title", e.target.value)} />
          <input style={{ ...field, width: 70 }} type="number" min="0.5" step="0.5" value={f.hours} onChange={(e) => upd("hours", e.target.value)} title="total hours" />
          <input style={field} type="date" min={iso(now)} value={f.deadline} onChange={(e) => upd("deadline", e.target.value)} />
          <select style={field} value={f.session} onChange={(e) => upd("session", e.target.value)}>
            {["45", "60", "90", "120"].map((m) => <option key={m} value={m}>{m} min sessions</option>)}
          </select>
          <select style={field} value={f.deep ? "deep" : "light"} onChange={(e) => upd("deep", e.target.value === "deep")}>
            <option value="deep">Deep focus</option><option value="light">Light task</option>
          </select>
          <select style={field} value={f.category} onChange={(e) => upd("category", e.target.value)}>
            {CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <button style={btn} onClick={plan}>Plan it</button>
          <button style={field} onClick={suggestAI}>Suggest times</button>
          <button style={field} onClick={replan}>Re-plan missed</button>
        </div>
        {msg && <p style={{ margin: "8px 0 0" }}>{msg}</p>}
      </div>

      <div style={card}>
        <b>Quick add (type it in plain words)</b>
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <textarea
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            placeholder="Plan 2 hours of thesis draft by Friday in 45 minute deep work sessions"
            style={{ ...field, flex: 1, minWidth: 260, minHeight: 52, resize: "vertical" }}
          />
          <button style={btn} onClick={chatTask}>Create task</button>
        </div>
      </div>

      {ai.length > 0 && (
        <div style={card}>
          <b>Suggested times</b>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {ai.map((s, idx) => (
              <div key={`${s.date}-${s.start}`} style={{ fontSize: 13, color: "#e8eaf0" }}>
                <strong>{idx + 1}.</strong> {s.date} · {hm(s.start)}-{hm(s.end)} — {s.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && !rows.some((r) => r.title.startsWith("Revision")) && (
        <div style={card}><button style={field} onClick={addRevision}>Add exam-period revision blocks (Jan 18 to Feb 12)</button></div>
      )}

      {picked && (
        <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ ...field, width: 200 }} value={ed.title} onChange={(e) => setEd({ ...ed, title: e.target.value })} />
          <input style={field} type="time" value={ed.s} onChange={(e) => setEd({ ...ed, s: e.target.value })} />
          <input style={field} type="time" value={ed.e} onChange={(e) => setEd({ ...ed, e: e.target.value })} />
          <button style={btn} onClick={() => saveEdit(picked.id)}>Save</button>
          <button style={field} onClick={() => toggleDone(picked.id)}>{picked.done ? "Undo done" : "Mark done"}</button>
          <button style={field} onClick={() => remove(picked.id)}>Delete{picked.weekdays ? " (all days)" : ""}</button>
          <button style={field} onClick={() => setSel(null)}>Close</button>
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #2e3441", borderRadius: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "44px repeat(7, minmax(100px, 1fr))", minWidth: 780 }}>
          <div />
          {days.map((d) => (
            <div key={iso(d)} style={{ textAlign: "center", padding: 6, fontWeight: 600, fontSize: 13, color: iso(d) === iso(now) ? "#8fb0ee" : undefined }}>
              {DN[d.getDay()]} {d.getDate()}
            </div>
          ))}
          <div style={{ position: "relative", height: 680 }}>
            {Array.from({ length: 17 }, (_, i) => (
              <span key={i} style={{ position: "absolute", top: i * 40 - 6, right: 5, fontSize: 11, color: "#9aa1ae" }}>{hm((i + 6) * 60)}</span>
            ))}
          </div>
          {days.map((d) => {
            const list = blocksOn(blocks.map((b) => ({ ...b, done: false })), iso(d)).sort((a, b) => a.start - b.start);
            return (
              <div key={iso(d)} style={{ position: "relative", height: 680, borderLeft: "1px solid #2e3441", background: "repeating-linear-gradient(to bottom, transparent 0 39px, #2e3441 39px 40px)" }}>
                {list.map((b) => {
                  const ov = list.filter((o) => o.start < b.end && o.end > b.start);
                  const r = byId.get(b.id)!;
                  return (
                    <div key={b.id} onClick={() => setSel(b.id)} style={{
                      position: "absolute", top: (b.start - 360) * 40 / 60, height: Math.max(16, (b.end - b.start) * 40 / 60 - 1),
                      left: `${ov.indexOf(b) * 100 / ov.length}%`, width: `${100 / ov.length - 1}%`, background: COLORS[r.category] ?? COLORS.task,
                      borderRadius: 6, padding: "2px 4px", fontSize: 11, lineHeight: 1.2, overflow: "hidden", cursor: "pointer", color: "#fff",
                      opacity: r.done ? 0.4 : 1, outline: ov.length > 1 ? "2px dashed #e11d48" : sel === b.id ? "2px solid #fff" : "none",
                    }}>
                      {r.done ? "✓ " : ""}{b.title}<br />{hm(b.start)}-{hm(b.end)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
