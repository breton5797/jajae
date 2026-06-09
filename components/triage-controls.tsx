"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKRW } from "@/lib/utils";
import type { TriagePolicy } from "@/lib/types";

export function RunTriageButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/triage", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMsg(`자동 처리: 승인 ${data.approved}건 · 에스컬레이션 ${data.escalated}건`);
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
        {busy ? "처리 중…" : "자동 처리 실행"}
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function TriagePolicyForm({ policy }: { policy: TriagePolicy | null }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(policy?.enabled ?? false);
  const [cap, setCap] = useState(String(policy?.auto_approve_cap ?? 0));
  const [minConf, setMinConf] = useState(String(policy?.min_confidence ?? 0.8));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/triage", {
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
          <p className="text-sm font-semibold">자동 트리아지 {enabled ? "켜짐" : "꺼짐"}</p>
          <p className="text-xs text-muted-foreground">
            상한 {formatKRW(Number(cap) || 0)} 이하 명백 승인만 자동 처리
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
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="cap">자동승인 상한(원)</Label>
          <Input id="cap" type="number" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="1000000" />
        </div>
        <div>
          <Label htmlFor="conf">신뢰도 임계(0~1)</Label>
          <Input id="conf" type="number" step="0.05" value={minConf} onChange={(e) => setMinConf(e.target.value)} placeholder="0.8" />
        </div>
      </div>
      <Button
        onClick={() => void save({ auto_approve_cap: Number(cap), min_confidence: Number(minConf) })}
        disabled={busy}
        variant="outline"
        size="sm"
      >
        한도 저장
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function TriageRowActions({ returnId }: { returnId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (action: "approve" | "reject" | "reverse") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/triage/${returnId}`, {
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
      <Button onClick={() => act("approve")} disabled={busy} size="sm">승인</Button>
      <Button onClick={() => act("reject")} disabled={busy} variant="outline" size="sm">거부</Button>
      <Button onClick={() => act("reverse")} disabled={busy} variant="ghost" size="sm">되돌리기</Button>
    </div>
  );
}
