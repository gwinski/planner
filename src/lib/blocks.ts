import type { Block } from "@/scheduler";

export type BlockRow = {
  id: string; title: string; category: string; start_min: number; end_min: number;
  weekdays: number[] | null; on_date: string | null; valid_from: string | null; valid_until: string | null;
  done: boolean; task_id: string | null; part: number | null; of_parts: number | null;
  deadline: string | null; deep: boolean | null; location: string | null;
};

export const fromRow = (r: BlockRow): Block => ({
  id: r.id, title: r.title, start: r.start_min, end: r.end_min,
  weekdays: r.weekdays ?? undefined, date: r.on_date ?? undefined,
  validFrom: r.valid_from ?? undefined, validUntil: r.valid_until ?? undefined,
  done: r.done, taskId: r.task_id ?? undefined, part: r.part ?? undefined, of: r.of_parts ?? undefined,
  deadline: r.deadline ?? undefined, deep: r.deep ?? undefined,
});

export const hm = (n: number) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
