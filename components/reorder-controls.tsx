"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReorderDraftButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/forecast/draft", { method: "POST" });
      const json = await res.json();
      setMsg(res.ok ? `${json.added}개 품목을 장바구니 초안에 담았습니다.` : json.error);
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button onClick={run} disabled={busy || count === 0} className="w-full">
        {busy ? "담는 중..." : `자동발주 초안 담기 (${count}건)`}
      </Button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}

export function ReorderRuleForm() {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [threshold, setThreshold] = useState("10");
  const [lead, setLead] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reorder-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          threshold: Number(threshold),
          leadTimeDays: Number(lead),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "등록 실패");
        return;
      }
      setProductId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">자동발주 규칙 추가</p>
      <Input
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        placeholder="상품 ID (UUID)"
      />
      <div className="flex gap-2">
        <Input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="안전재고"
        />
        <Input
          type="number"
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          placeholder="리드타임(일)"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={busy || !productId} size="sm" className="w-full">
        규칙 저장
      </Button>
    </div>
  );
}
