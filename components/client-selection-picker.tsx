"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatKRW, cn } from "@/lib/utils";
import type { ClientSelectionOption } from "@/lib/types";

export function ClientSelectionPicker({
  selectionId,
  options,
  chosen,
  status,
}: {
  selectionId: string;
  options: ClientSelectionOption[];
  chosen: string[];
  status: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(chosen[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (decline = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/client/selection/${selectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chosen: decline || !picked ? [] : [picked] }),
      });
      const json = await res.json();
      setMsg(
        res.ok
          ? json.status === "chosen"
            ? "선택이 저장되었습니다."
            : "선택 안 함으로 저장되었습니다."
          : json.error,
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setPicked(o.id)}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm",
              picked === o.id ? "border-brand bg-brand-50" : "hover:bg-muted",
            )}
          >
            <span>{o.label}</span>
            <span className="font-semibold">{formatKRW(o.unitPrice)}</span>
          </button>
        ))}
      </div>
      {status !== "open" && (
        <p className="text-xs text-muted-foreground">현재 상태: {status}</p>
      )}
      {msg && <p className="text-sm text-success">{msg}</p>}
      <div className="flex gap-2">
        <Button onClick={() => submit(false)} disabled={busy || !picked} className="flex-1">
          이 자재로 선택
        </Button>
        <Button variant="outline" onClick={() => submit(true)} disabled={busy}>
          선택 안 함
        </Button>
      </div>
    </div>
  );
}
