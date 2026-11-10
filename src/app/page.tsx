"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { SEED } from "@/lib/seed";
import { fromRow, hm, type BlockRow } from "@/lib/blocks";
import { blocksOn } from "@/scheduler";

const localIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function load() {
    const { data, error } = await supabase.from("blocks").select("*");
    if (error) return setMsg("Could not load: " + error.message);
    setRows((data ?? []) as BlockRow[]);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function seed() {
    const { error } = await supabase.from("blocks").insert(SEED);
    setMsg(error ? "Could not save: " + error.message : "Timetable saved.");
    load();
  }

  const signIn = () =>
    supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo: window.location.origin } });

  const box: React.CSSProperties = { maxWidth: 640, margin: "0 auto", padding: 20 };
  const btn: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: 0, background: "#8fb0ee", color: "#14171d", fontSize: 15, cursor: "pointer" };

  if (!ready) return <div style={box}>Loading...</div>;

  if (!user)
    return (
      <div style={box}>
        <h1>400L Planner</h1>
        <p>Sign in to see your schedule.</p>
        <button style={btn} onClick={signIn}>Sign in with GitHub</button>
      </div>
    );

  const today = blocksOn(rows.map(fromRow), localIso()).sort((a, b) => a.start - b.start);
  return (
    <div style={box}>
      <h1>400L Planner</h1>
      <p>Signed in as {user.email ?? user.user_metadata?.user_name}. <button onClick={() => supabase.auth.signOut()} style={{ ...btn, padding: "4px 10px", fontSize: 13 }}>Sign out</button></p>
      {rows.length === 0 && <button style={btn} onClick={seed}>Load my timetable</button>}
      {msg && <p>{msg}</p>}
      <h2>Today ({localIso()})</h2>
      {today.length === 0 && <p>Nothing scheduled.</p>}
      {today.map((b) => (
        <div key={b.id} style={{ padding: "6px 0", borderBottom: "1px solid #2e3441" }}>
          <b>{hm(b.start)}-{hm(b.end)}</b> {b.title}
        </div>
      ))}
      <p style={{ color: "#9aa1ae" }}>{rows.length} blocks saved in your database.</p>
    </div>
  );
}
