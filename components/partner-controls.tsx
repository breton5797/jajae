"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { API_SCOPES } from "@/lib/api-scopes";
import type { ApiClient } from "@/lib/types";

export function ApiClientCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["products:read"]);
  const [busy, setBusy] = useState(false);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "생성 실패");
        return;
      }
      setIssuedKey(json.apiKey);
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">API 클라이언트 생성</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="앱 이름" />
      <div className="flex flex-wrap gap-2">
        {API_SCOPES.map((s) => (
          <label key={s} className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />
            {s}
          </label>
        ))}
      </div>
      {issuedKey && (
        <div className="rounded-md bg-amber-50 p-2 text-xs">
          <p className="font-semibold text-amber-700">
            API 키 (다시 표시되지 않습니다 — 안전하게 보관하세요):
          </p>
          <code className="break-all">{issuedKey}</code>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={busy || !name || scopes.length === 0} size="sm" className="w-full">
        클라이언트 생성
      </Button>
    </div>
  );
}

export function WebhookForm({ clients }: { clients: ApiClient[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [event, setEvent] = useState("order.created");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (clients.length === 0) {
    return <p className="text-sm text-muted-foreground">먼저 API 클라이언트를 생성하세요.</p>;
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, event, url }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "생성 실패");
        return;
      }
      setSecret(json.secret);
      setUrl("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">웹훅 등록</p>
      <Label className="text-xs">클라이언트</Label>
      <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select value={event} onChange={(e) => setEvent(e.target.value)}>
        <option value="order.created">order.created</option>
        <option value="po.fulfilled">po.fulfilled</option>
        <option value="settlement.closed">settlement.closed</option>
      </Select>
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your.app/webhook" />
      {secret && (
        <div className="rounded-md bg-amber-50 p-2 text-xs">
          <p className="font-semibold text-amber-700">서명 시크릿:</p>
          <code className="break-all">{secret}</code>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={busy || !url} size="sm" className="w-full">
        웹훅 등록
      </Button>
    </div>
  );
}
