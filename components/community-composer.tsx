"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function CommunityComposer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("thread");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "작성 실패");
        return;
      }
      setTitle("");
      setBody("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full">
        + 글쓰기
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <Select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="thread">자유글</option>
        <option value="qna">질문(Q&A)</option>
        <option value="notice">정보공유</option>
      </Select>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="내용"
        className="min-h-24 w-full rounded-md border border-input p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy || !title} className="flex-1">
          {busy ? "등록 중..." : "등록"}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  );
}
