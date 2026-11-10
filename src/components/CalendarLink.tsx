"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

const field: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #2e3441", background: "#1c2029", color: "#e8eaf0", fontSize: 14 };

export default function CalendarLink() {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");

  async function get(reset = false) {
    if (reset) await supabase.from("calendar_tokens").delete().neq("token", "");
    let { data } = await supabase.from("calendar_tokens").select("token").maybeSingle();
    if (!data) data = (await supabase.from("calendar_tokens").insert({}).select("token").single()).data;
    if (data) setUrl(`${window.location.origin}/api/cal/${data.token}.ics`);
    setNote(reset ? "New link created. The old one has stopped working." : "");
  }
  async function copy() {
    await navigator.clipboard.writeText(url);
    setNote("Copied.");
  }

  return (
    <div style={{ background: "#1c2029", border: "1px solid #2e3441", borderRadius: 12, padding: 12, marginTop: 12 }}>
      <b>Phone calendar link</b>
      <p style={{ fontSize: 13, color: "#9aa1ae", margin: "6px 0" }}>
        Subscribe once and your phone calendar follows this planner. Anyone with the link can read your schedule, so keep it private.
      </p>
      {!url ? (
        <button style={field} onClick={() => get()}>Get my calendar link</button>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ ...field, flex: 1, minWidth: 240 }} readOnly value={url} onFocus={(e) => e.target.select()} />
          <button style={field} onClick={copy}>Copy</button>
          <button style={field} onClick={() => get(true)}>Make a new link</button>
        </div>
      )}
      {note && <p style={{ margin: "6px 0 0", fontSize: 13 }}>{note}</p>}
      {url && (
        <p style={{ fontSize: 12, color: "#9aa1ae", margin: "8px 0 0" }}>
          Google Calendar (web): Other calendars, then From URL. iPhone: Settings, Calendar, Accounts, Add Subscribed Calendar. The link only works for your phone once the app is deployed (it can&apos;t reach a codespace).
        </p>
      )}
    </div>
  );
}
