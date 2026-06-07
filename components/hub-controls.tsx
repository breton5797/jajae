"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Hub } from "@/lib/types";

export function HubCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/hubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hub", name, location }),
      });
      if (res.ok) {
        setName("");
        setLocation("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">허브 추가</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="허브명 (예: 서울 송파허브)" />
      <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="위치" />
      <Button onClick={submit} disabled={busy || !name} size="sm" className="w-full">
        허브 생성
      </Button>
    </div>
  );
}

export function HubInventoryForm({ hubs }: { hubs: Hub[] }) {
  const router = useRouter();
  const [hubId, setHubId] = useState(hubs[0]?.id ?? "");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);

  if (hubs.length === 0) {
    return <p className="text-sm text-muted-foreground">먼저 허브를 생성하세요.</p>;
  }

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/hubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inventory",
          hubId,
          productId,
          qty: Number(qty),
        }),
      });
      if (res.ok) {
        setProductId("");
        setQty("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">허브 재고 설정</p>
      <Label className="text-xs">허브</Label>
      <Select value={hubId} onChange={(e) => setHubId(e.target.value)}>
        {hubs.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </Select>
      <Input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="상품 ID (UUID)" />
      <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="수량" />
      <Button onClick={submit} disabled={busy || !productId || !qty} size="sm" className="w-full">
        재고 저장
      </Button>
    </div>
  );
}
