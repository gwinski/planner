import { createClient } from "@supabase/supabase-js";
import { buildIcs } from "@/lib/ics";
import type { BlockRow } from "@/lib/blocks";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { data, error } = await sb.rpc("calendar_feed", { p_token: token.replace(/\.ics$/, "") });
  if (error || !data || data.length === 0) return new Response("Not found", { status: 404 });
  const today = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
  return new Response(buildIcs(data as BlockRow[], today), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" },
  });
}
