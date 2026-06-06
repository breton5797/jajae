"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadToBucket, SITE_DOCS_BUCKET } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { SiteDocument, SiteTask } from "@/lib/types";

export function SiteTaskManager({
  siteId,
  tasks,
  documents,
}: {
  siteId: string;
  tasks: SiteTask[];
  documents: SiteDocument[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [busy, setBusy] = useState(false);

  const post = async (body: unknown) => {
    setBusy(true);
    try {
      await fetch(`/api/sites/${siteId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const addTask = async () => {
    if (!title) return;
    await post({ action: "task", title, planned_date: plannedDate || undefined });
    setTitle("");
    setPlannedDate("");
  };

  const toggle = (task: SiteTask) =>
    post({ action: "task_toggle", taskId: task.id, done: !task.done });

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const { path, error } = await uploadToBucket(SITE_DOCS_BUCKET, file);
    if (path && !error) {
      await post({
        action: "doc",
        name: file.name,
        file_path: path,
        file_type: file.type,
      });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="공정/작업 추가 (예: 타일시공)"
          />
          <Input
            type="date"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
            className="w-40"
          />
          <Button onClick={addTask} disabled={busy || !title} size="sm">
            추가
          </Button>
        </div>
        <ul className="divide-y rounded-lg border">
          {tasks.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">
              등록된 일정이 없습니다.
            </li>
          )}
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 p-3 text-sm">
              <button onClick={() => toggle(t)} disabled={busy} aria-label="완료 토글">
                {t.done ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              <span className={cn("flex-1", t.done && "text-muted-foreground line-through")}>
                {t.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.planned_date ?? "-"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">현장 문서</span>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> 업로드
            <input type="file" className="hidden" onChange={onUpload} disabled={busy} />
          </label>
        </div>
        <ul className="divide-y rounded-lg border">
          {documents.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">
              첨부된 문서가 없습니다.
            </li>
          )}
          {documents.map((d) => (
            <li key={d.id} className="p-3 text-sm">
              {d.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
