"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatKRW } from "@/lib/utils";

export function FinanceRequestForm({ eligible }: { eligible: boolean }) {
  const router = useRouter();
  const [type, setType] = useState("early_settlement");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ advance: number; fee: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/finance/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, amount: Number(amount) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "요청 실패");
        return;
      }
      setResult({ advance: json.advance, fee: json.fee });
      setAmount("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!eligible) {
    return (
      <p className="text-sm text-muted-foreground">
        현재 신용 등급으로는 금융 상품을 이용할 수 없습니다. 거래 실적이 쌓이면 한도가 부여됩니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="early_settlement">선정산 (받을 정산금 선지급)</option>
        <option value="purchase_financing">구매 파이낸싱</option>
      </Select>
      <Input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="신청 금액 (원)"
      />
      {result && (
        <div className="rounded-md bg-brand-50 p-2 text-sm text-brand-700">
          승인! 선지급액 {formatKRW(result.advance)} (수수료 {formatKRW(result.fee)})
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={busy || !amount} className="w-full">
        {busy ? "신청 중..." : "금융 신청"}
      </Button>
    </div>
  );
}
