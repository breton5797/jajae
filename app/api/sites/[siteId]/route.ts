import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadSiteWorkspace } from "@/lib/data/projects";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { siteId: string } },
) {
  return NextResponse.json(await loadSiteWorkspace(params.siteId));
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("task"),
    title: z.string().min(1),
    phase: z.string().optional(),
    planned_date: z.string().optional(),
  }),
  z.object({ action: z.literal("task_toggle"), taskId: z.string().uuid(), done: z.boolean() }),
  z.object({
    action: z.literal("doc"),
    name: z.string().min(1),
    file_path: z.string().min(1),
    file_type: z.string().optional(),
  }),
  z.object({ action: z.literal("budget"), budget: z.number().nonnegative() }),
]);

export async function POST(
  req: Request,
  { params }: { params: { siteId: string } },
) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const sb = createServerSupabase();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const action = parsed.data;

    if (action.action === "task") {
      await sb.from("site_tasks").insert({
        site_id: params.siteId,
        contractor_id: user.id,
        title: action.title,
        phase: action.phase ?? "",
        planned_date: action.planned_date ?? null,
      });
    } else if (action.action === "task_toggle") {
      await sb
        .from("site_tasks")
        .update({ done: action.done })
        .eq("id", action.taskId);
    } else if (action.action === "doc") {
      await sb.from("site_documents").insert({
        site_id: params.siteId,
        contractor_id: user.id,
        name: action.name,
        file_path: action.file_path,
        file_type: action.file_type ?? "",
      });
    } else {
      await sb
        .from("sites")
        .update({ budget: action.budget })
        .eq("id", params.siteId);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
