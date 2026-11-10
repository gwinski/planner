"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Planner from "@/components/Planner";
import CalendarLink from "@/components/CalendarLink";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMsg, setAuthMsg] = useState("");

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

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthMsg("Enter an email and password to continue.");
      return;
    }

    try {
      if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setAuthMsg("Account created. Check your inbox to confirm your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthMsg("");
      }
    } catch (error) {
      setAuthMsg(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  };

  const box: React.CSSProperties = { maxWidth: 1000, margin: "0 auto", padding: 16 };
  const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: 0, background: "#8fb0ee", color: "#14171d", fontSize: 14, cursor: "pointer" };
  const field: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #2e3441", background: "#1c2029", color: "#e8eaf0", fontSize: 14 };

  if (!ready) return <div style={box}>Loading...</div>;
  if (!user)
    return (
      <div style={box}>
        <h1>400L Planner</h1>
        <p>Sign up or sign in to see your schedule.</p>

        <div style={{ background: "#1c2029", border: "1px solid #2e3441", borderRadius: 12, padding: 16, maxWidth: 420 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button style={{ ...btn, opacity: mode === "sign-up" ? 1 : 0.7 }} onClick={() => setMode("sign-up")}>Create account</button>
            <button style={{ ...btn, opacity: mode === "sign-in" ? 1 : 0.7 }} onClick={() => setMode("sign-in")}>Sign in</button>
          </div>

          <form onSubmit={submitAuth} style={{ display: "grid", gap: 10 }}>
            <input style={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input style={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button style={btn} type="submit">{mode === "sign-up" ? "Create account" : "Sign in"}</button>
          </form>

          {authMsg && <p style={{ marginTop: 10, fontSize: 13 }}>{authMsg}</p>}

          <div style={{ marginTop: 16, borderTop: "1px solid #2e3441", paddingTop: 16 }}>
            <button style={{ ...btn, width: "100%" }} onClick={signIn}>Continue with GitHub</button>
          </div>
        </div>
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
      <CalendarLink />
    </div>
  );
}
