"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AsTriagePolicy } from "@/lib/types";

export function RunAsTriageButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/as-triage", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMsg(`자동 처리: 예약 ${data.scheduled}건 · 에스컬레이션 ${data.escalated}건`);
        router.refresh();
      } else {
        setMsg(data.error ?? "실행 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={busy} size="sm">
        {busy ? "처리 중…" : "AS 자동 처리 실행"}
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function AsTriagePolicyForm({ policy }: { policy: AsTriagePolicy | null }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy?.enabled ?? false);
  const [minConf, setMinConf] = useState(String(policy?.min_confidence ?? 0.8));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/as-triage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setMsg("저장됨");
        router.refresh();
      } else {
        const data = await res.json();
        setMsg(data.error ?? "저장 실패");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">AS 자동 트리아지 {enabled ? "켜짐" : "꺼짐"}</p>
          <p className="text-xs text-muted-foreground">
            공급사/배송 귀책 · 고신뢰 AS만 자동 예약
          </p>
        </div>
        <Button
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            void save({ enabled: next });
          }}
          disabled={busy}
          variant={enabled ? "destructive" : "default"}
          size="sm"
        >
          {enabled ? "긴급 중지" : "자동화 켜기"}
        </Button>
      </div>
      <div>
        <Label htmlFor="as-conf">신뢰도 임계(0~1)</Label>
        <Input id="as-conf" type="number" step="0.05" value={minConf} onChange={(e) => setMinConf(e.target.value)} placeholder="0.8" />
      </div>
      <Button
        onClick={() => void save({ min_confidence: Number(minConf) })}
        disabled={busy}
        variant="outline"
        size="sm"
      >
        임계값 저장
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function AsTriageRowActions({ asRequestId }: { asRequestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (action: "schedule" | "reject" | "reverse") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/as-triage/${asRequestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button onClick={() => void act("schedule")} disabled={busy} size="sm">예약</Button>
      <Button onClick={() => void act("reject")} disabled={busy} variant="outline" size="sm">거부</Button>
      <Button onClick={() => void act("reverse")} disabled={busy} variant="ghost" size="sm">되돌리기</Button>
    </div>
  );
}
