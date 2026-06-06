"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { RunStatus } from "@/lib/types";

export function BatchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/logistics/batch", { method: "POST" });
      const json = await res.json();
      setMsg(res.ok ? `${json.created}개 배차 생성됨` : json.error ?? "실패");
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button onClick={run} disabled={busy} className="w-full">
        {busy ? "배차 계산 중..." : "AI 배차 생성 (지역별 묶음배송)"}
      </Button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function RunStatusSelect({
  runId,
  status,
}: {
  runId: string;
  status: RunStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const change = async (next: string) => {
    setBusy(true);
    try {
      await fetch(`/api/logistics/run/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select
      value={status}
      onChange={(e) => change(e.target.value)}
      disabled={busy}
      className="h-9 w-32"
    >
      <option value="planned">계획</option>
      <option value="confirmed">확정</option>
      <option value="dispatched">배차/출발</option>
      <option value="completed">완료</option>
    </Select>
  );
}
