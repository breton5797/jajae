"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKRW } from "@/lib/utils";

export function PbCreateForm({
  categoryId,
  categoryName,
}: {
  categoryId: string;
  categoryName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [cost, setCost] = useState("");
  const [margin, setMargin] = useState("0.2");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const price = cost ? Math.round(Number(cost) * (1 + Number(margin))) : 0;

  const submit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/pb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sku,
          categoryId,
          supplierId,
          cost: Number(cost),
          marginRate: Number(margin),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "생성 실패");
        return;
      }
      setResult(`PB SKU 생성 완료: ${json.sku}`);
      router.refresh();
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">
        {categoryName} PB SKU 생성
      </p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="상품명" />
      <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU (예: PB-FLR-001)" />
      <Input
        value={supplierId}
        onChange={(e) => setSupplierId(e.target.value)}
        placeholder="지정 공급사 ID (UUID)"
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="text-xs">원가</Label>
          <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="30000" />
        </div>
        <div className="w-24">
          <Label className="text-xs">마진율</Label>
          <Input type="number" step="0.05" value={margin} onChange={(e) => setMargin(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">판매가(마진 반영): {formatKRW(price)}</p>
      {result && <p className="text-sm text-success">{result}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={submit}
        disabled={loading || !name || !sku || !supplierId || !cost}
        className="w-full"
        size="sm"
      >
        {loading ? "생성 중..." : "PB SKU 생성"}
      </Button>
    </div>
  );
}
