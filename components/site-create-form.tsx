"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SiteCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [budget, setBudget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address,
          budget: budget ? Number(budget) : 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "현장 생성 실패");
        return;
      }
      setName("");
      setAddress("");
      setBudget("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full">
        + 새 현장 등록
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <Label htmlFor="site-name">현장명</Label>
        <Input
          id="site-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 래미안 84동 1203호"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="site-addr">주소</Label>
        <Input
          id="site-addr"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="서울시 ..."
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="site-budget">예산 (원)</Label>
        <Input
          id="site-budget"
          type="number"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="20000000"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={loading || !name} className="flex-1">
          {loading ? "등록 중..." : "등록"}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  );
}
