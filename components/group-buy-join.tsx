"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKRW } from "@/lib/utils";

export function GroupBuyJoin({
  groupBuyId,
  initialQty,
  closed,
}: {
  groupBuyId: string;
  initialQty: number;
  closed: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(String(initialQty || 10));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setLoading(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/group-buy/${groupBuyId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qty: Number(qty) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "참여에 실패했습니다.");
        return;
      }
      setMsg(
        `참여 완료! 현재 누적 ${json.joinedQty}개 · 적용가 ${formatKRW(json.currentPrice)}`,
      );
      router.refresh();
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  if (closed) {
    return <p className="text-sm text-muted-foreground">마감된 공동구매입니다.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-28"
          min={1}
        />
        <Button onClick={join} disabled={loading || Number(qty) <= 0} className="flex-1">
          {loading ? "참여 중..." : initialQty > 0 ? "수량 변경" : "공동구매 참여"}
        </Button>
      </div>
      {msg && <p className="text-sm text-success">{msg}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
