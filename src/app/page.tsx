"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Planner from "@/components/Planner";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = () =>
    supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo: window.location.origin } });

  const box: React.CSSProperties = { maxWidth: 1000, margin: "0 auto", padding: 16 };
  const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: 0, background: "#8fb0ee", color: "#14171d", fontSize: 14, cursor: "pointer" };

  if (!ready) return <div style={box}>Loading...</div>;
  if (!user)
    return (
      <div style={box}>
        <h1>400L Planner</h1>
        <p>Sign in to see your schedule.</p>
        <button style={btn} onClick={signIn}>Sign in with GitHub</button>
      </div>
    );

  return (
    <div style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: "0 0 12px" }}>400L Planner</h1>
        <span style={{ fontSize: 13 }}>
          {user.email ?? user.user_metadata?.user_name}{" "}
          <button style={{ ...btn, padding: "4px 10px", fontSize: 12 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </span>
      </div>
      <Planner />
    </div>
  );
}
