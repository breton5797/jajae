"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AgentPolicy } from "@/lib/types";

export function KillSwitch({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/agent/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !on }),
      });
      if (res.ok) {
        setOn(!on);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <p className="text-sm font-semibold">자율 운영 {on ? "켜짐" : "꺼짐"}</p>
        <p className="text-xs text-muted-foreground">
          {on ? "에이전트가 정책 범위 내 자동 발주합니다." : "킬스위치 작동 — 자동 발주 중지"}
        </p>
      </div>
      <Button
        onClick={toggle}
        disabled={busy}
        variant={on ? "destructive" : "default"}
        size="sm"
      >
        {on ? "긴급 중지" : "자율 운영 켜기"}
      </Button>
    </div>
  );
}

export function AgentPolicyForm({ policy }: { policy: AgentPolicy | null }) {
  const router = useRouter();
  const [spendCap, setSpendCap] = useState(String(policy?.spend_cap ?? 10000000));
  const [maxPo, setMaxPo] = useState(String(policy?.max_po ?? 3000000));
  const [threshold, setThreshold] = useState(String(policy?.escalation_threshold ?? 2000000));
  const [allowlist, setAllowlist] = useState((policy?.supplier_allowlist ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agent/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spendCap: Number(spendCap),
          maxPo: Number(maxPo),
          escalationThreshold: Number(threshold),
          supplierAllowlist: allowlist.split(",").map((s) => s.trim()).filter(Boolean),
          enabled: policy?.enabled ?? false,
        }),
      });
      setMsg(res.ok ? "정책이 저장되었습니다." : "저장 실패");
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">자율 운영 정책</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">월 지출 한도</Label>
          <Input type="number" value={spendCap} onChange={(e) => setSpendCap(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">자동발주 최대액</Label>
          <Input type="number" value={maxPo} onChange={(e) => setMaxPo(e.target.value)} />
        </div>
      </div>
      <div>
        <Label className="text-xs">에스컬레이션 임계값</Label>
        <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">승인 공급사 (콤마 구분 ID)</Label>
        <Input value={allowlist} onChange={(e) => setAllowlist(e.target.value)} placeholder="supplier-uuid, ..." />
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <Button onClick={save} disabled={busy} size="sm" className="w-full">
        정책 저장
      </Button>
    </div>
  );
}

export function RunAgentButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agent/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) setMsg(json.error ?? "실행 실패");
      else if (json.halted) setMsg("킬스위치 작동 중 — 실행되지 않음");
      else setMsg(`자동 발주 ${json.auto}건, 에스컬레이션 ${json.escalated}건`);
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button onClick={run} disabled={busy || disabled} className="w-full">
        {busy ? "에이전트 실행 중..." : "지금 에이전트 실행"}
      </Button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function DecisionActions({ decisionId }: { decisionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (action: "approve" | "reject") => {
    setBusy(true);
    try {
      await fetch(`/api/agent/decision/${decisionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => act("approve")} disabled={busy}>
        승인
      </Button>
      <Button size="sm" variant="outline" onClick={() => act("reject")} disabled={busy}>
        반려
      </Button>
    </div>
  );
}

export function ReverseButton({
  actionId,
  reversed,
}: {
  actionId: string;
  reversed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reverse = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/agent/action/${actionId}/reverse`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) setMsg(json.error ?? "취소 실패");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (reversed) return <span className="text-xs text-muted-foreground">취소됨</span>;
  return (
    <div className="text-right">
      <Button size="sm" variant="ghost" onClick={reverse} disabled={busy} className={cn("text-destructive")}>
        발주 취소
      </Button>
      {msg && <p className="text-xs text-destructive">{msg}</p>}
    </div>
  );
}
