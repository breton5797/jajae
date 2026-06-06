"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadToBucket, SITE_DOCS_BUCKET } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function ReviewForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const { path, error: upErr } = await uploadToBucket(SITE_DOCS_BUCKET, file);
    if (path && !upErr) setPhoto(path);
    else setError("사진 업로드 실패 — 사진 없이 등록할 수 있습니다.");
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          rating,
          body,
          photos: photo ? [photo] : [],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "등록 실패");
        return;
      }
      setDone(true);
      setBody("");
      router.refresh();
    } catch {
      setError("네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return <p className="text-sm text-success">리뷰가 등록되었습니다. 감사합니다!</p>;
  }

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-sm font-semibold">리뷰 작성</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}점`}>
            <Star
              className={cn(
                "h-6 w-6",
                n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
              )}
            />
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="시공 후기, 품질, 배송 등을 5자 이상 적어주세요"
        className="min-h-20 w-full rounded-md border border-input p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-brand">
        사진 첨부
        <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={busy} />
      </label>
      {photo && <span className="ml-2 text-xs text-success">사진 첨부됨</span>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={submit} disabled={busy || body.trim().length < 5} className="w-full" size="sm">
        {busy ? "등록 중..." : "리뷰 등록"}
      </Button>
    </div>
  );
}
