"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ReferralPanel({ existingCode }: { existingCode?: string }) {
  const [code, setCode] = useState<string | null>(existingCode ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/referral", { method: "POST" });
      const json = await res.json();
      if (res.ok) setCode(json.code);
    } finally {
      setBusy(false);
    }
  };

  const link =
    code && typeof window !== "undefined"
      ? `${window.location.origin}/login?ref=${code}`
      : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-2">
      {!code ? (
        <Button onClick={generate} disabled={busy} className="w-full">
          {busy ? "생성 중..." : "초대 코드 만들기"}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="rounded-md border bg-muted/40 p-3 text-center font-mono text-sm">
            {code}
          </div>
          {link && (
            <Button variant="outline" onClick={copy} className="w-full">
              {copied ? "복사됨!" : "초대 링크 복사"}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            초대한 시공사가 첫 주문을 완료하면 적립금이 정산에 반영됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
