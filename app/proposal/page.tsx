"use client";

/**
 * app/proposal/page.tsx
 * 즉석 인테리어 제안 — 3단계 플로우: 상담 입력(STT/요약) → 브리프 확인/편집 → 프레젠테이션.
 * 입력/브리프 폼은 app/estimate/page.tsx의 검증된 마크업을 재사용하고 pyeong 필드를 추가한다.
 */

import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PresentationView,
  type PresentationData,
} from "@/components/proposal/presentation-view";
import { fileToBase64 } from "@/lib/storage";
import type { EstimateBrief, ProjectType, RoomType, SpecLevel } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "apartment_remodel", label: "아파트 리모델링" },
  { value: "bathroom", label: "욕실" },
  { value: "kitchen", label: "주방" },
  { value: "commercial_interior", label: "상업공간" },
  { value: "new_build", label: "신축" },
];

const SPEC_LEVELS: { value: SpecLevel; label: string }[] = [
  { value: "economy", label: "실속형" },
  { value: "standard", label: "표준" },
  { value: "premium", label: "프리미엄" },
];

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "living", label: "거실" },
  { value: "room", label: "방" },
  { value: "bathroom", label: "욕실" },
  { value: "kitchen", label: "주방" },
  { value: "balcony", label: "발코니" },
  { value: "entrance", label: "현관" },
  { value: "other", label: "기타" },
];

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (Whisper limit)

type Step = "input" | "brief" | "result";

type RoomFormEntry = { name: string; type: RoomType; widthM: string; lengthM: string };

type BriefFormState = {
  projectType: ProjectType;
  specLevel: SpecLevel;
  pyeong: string;
  budgetKRW: string;
  rooms: RoomFormEntry[];
};

// ─── Form helpers (immutable) ───────────────────────────────────────────────────

function defaultBriefForm(): BriefFormState {
  return {
    projectType: "apartment_remodel",
    specLevel: "standard",
    pyeong: "25",
    budgetKRW: "",
    rooms: [{ name: "거실", type: "living", widthM: "5", lengthM: "4" }],
  };
}

function apiBriefToForm(brief: EstimateBrief): BriefFormState {
  return {
    projectType: brief.projectType,
    specLevel: brief.specLevel,
    pyeong: brief.pyeong != null ? String(brief.pyeong) : "",
    budgetKRW: brief.budgetKRW != null ? String(brief.budgetKRW) : "",
    rooms: brief.rooms.map((r) => ({
      name: r.name,
      type: r.type,
      widthM: String(r.widthM),
      lengthM: String(r.lengthM),
    })),
  };
}

function formToBrief(form: BriefFormState): EstimateBrief {
  return {
    projectType: form.projectType,
    specLevel: form.specLevel,
    pyeong: form.pyeong ? parseFloat(form.pyeong) || undefined : undefined,
    budgetKRW: form.budgetKRW ? parseInt(form.budgetKRW, 10) : undefined,
    rooms: form.rooms
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        name: r.name.trim(),
        type: r.type,
        widthM: Math.max(0, parseFloat(r.widthM) || 0),
        lengthM: Math.max(0, parseFloat(r.lengthM) || 0),
      })),
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function ProposalPage() {
  const [step, setStep] = useState<Step>("input");

  // Step 1
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");

  // Step 2
  const [briefForm, setBriefForm] = useState<BriefFormState>(defaultBriefForm());

  // Step 3
  const [data, setData] = useState<PresentationData | null>(null);

  // Shared
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAudioFile(e.target.files?.[0] ?? null);
    setTranscribeError(null);
  }

  async function handleTranscribe() {
    if (!audioFile) return;
    if (audioFile.size > MAX_AUDIO_BYTES) {
      setTranscribeError("파일 크기가 25MB를 초과합니다. 더 짧은 파일을 사용하세요.");
      return;
    }
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const audioBase64 = await fileToBase64(audioFile);
      const res = await fetch("/api/estimate/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType: audioFile.type }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTranscribeError(json.error ?? "전사에 실패했습니다.");
        return;
      }
      setTranscript((json as { transcript: string }).transcript);
    } catch {
      setTranscribeError("네트워크 오류가 발생했습니다.");
    } finally {
      setTranscribing(false);
    }
  }

  async function extractBrief() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/estimate/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "브리프 추출에 실패했습니다.");
        return;
      }
      setBriefForm(apiBriefToForm(json as EstimateBrief));
      setStep("brief");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const brief = formToBrief(briefForm);
      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          customerName: customerName.trim() || undefined,
        }),
      });
      if (res.status === 401) {
        setError("LOGIN_REQUIRED");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "제안 생성에 실패했습니다.");
        return;
      }
      setData({
        proposalId: json.proposalId,
        template: json.template,
        furnishedScene: json.furnishedScene,
        finishes: json.finishes,
        materialsKRW: json.materialsKRW,
        constructionKRW: json.constructionKRW,
        totalKRW: json.totalKRW,
        customerName: customerName.trim() || undefined,
      });
      setStep("result");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function updateRoom(i: number, patch: Partial<RoomFormEntry>) {
    setBriefForm((f) => ({
      ...f,
      rooms: f.rooms.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  }
  function addRoom() {
    setBriefForm((f) => ({
      ...f,
      rooms: [...f.rooms, { name: "", type: "room", widthM: "3", lengthM: "3" }],
    }));
  }
  function removeRoom(i: number) {
    setBriefForm((f) => ({ ...f, rooms: f.rooms.filter((_, idx) => idx !== i) }));
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold text-brand-700">즉석 인테리어 제안</h1>
        <p className="text-sm text-muted-foreground">
          상담 음성 또는 요약 → 라벨링 평면도 + 3D 렌더 + 자재 디테일 + 예산 제안서 즉석 생성
        </p>
      </div>

      {error && error !== "LOGIN_REQUIRED" && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {error === "LOGIN_REQUIRED" && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          제안을 저장하려면{" "}
          <a href="/login" className="underline">
            로그인
          </a>
          이 필요합니다.
        </p>
      )}

      {step === "input" && (
        <Card>
          <CardHeader>
            <CardTitle>1단계 · 상담 내용 입력</CardTitle>
            <CardDescription>
              상담 음성 파일을 업로드하거나, 상담 요약을 직접 입력하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="customerName">고객명 (선택)</Label>
              <Input
                id="customerName"
                placeholder="예: 홍길동"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>음성 파일 업로드 (선택)</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-hairline py-5 text-sm text-muted-foreground hover:bg-muted">
                <Upload className="h-5 w-5 shrink-0" />
                <span>{audioFile?.name ?? "MP3 / WAV / M4A / WebM (최대 25MB)"}</span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleAudioChange}
                />
              </label>
              {audioFile && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTranscribe}
                  disabled={transcribing}
                >
                  {transcribing ? "전사 중..." : "AI 자동 전사"}
                </Button>
              )}
              {transcribeError && (
                <p className="text-sm text-destructive">{transcribeError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transcript">상담 요약 (직접 입력 또는 전사 결과 편집)</Label>
              <textarea
                id="transcript"
                rows={6}
                className="min-h-32 w-full resize-y rounded-md border border-input bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="예) 25평 아파트, 방3 욕실2, 예산 4천만원, 화이트 톤 선호…"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={extractBrief}
              disabled={busy || transcript.trim().length === 0}
              className="w-full"
            >
              {busy ? "브리프 추출 중..." : "다음 — 브리프 확인"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "brief" && (
        <Card>
          <CardHeader>
            <CardTitle>2단계 · 브리프 확인 및 수정</CardTitle>
            <CardDescription>추출된 요구사항을 확인하고 필요하면 수정하세요.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="projectType">공사 유형</Label>
                <Select
                  id="projectType"
                  value={briefForm.projectType}
                  onChange={(e) =>
                    setBriefForm((f) => ({
                      ...f,
                      projectType: e.target.value as ProjectType,
                    }))
                  }
                >
                  {PROJECT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="specLevel">사양 수준</Label>
                <Select
                  id="specLevel"
                  value={briefForm.specLevel}
                  onChange={(e) =>
                    setBriefForm((f) => ({
                      ...f,
                      specLevel: e.target.value as SpecLevel,
                    }))
                  }
                >
                  {SPEC_LEVELS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pyeong">평형 (평)</Label>
                <Input
                  id="pyeong"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="예: 25"
                  value={briefForm.pyeong}
                  onChange={(e) =>
                    setBriefForm((f) => ({ ...f, pyeong: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budgetKRW">예산 (원, 선택)</Label>
                <Input
                  id="budgetKRW"
                  type="number"
                  min={0}
                  step={1000000}
                  placeholder="예: 40000000"
                  value={briefForm.budgetKRW}
                  onChange={(e) =>
                    setBriefForm((f) => ({ ...f, budgetKRW: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>공간 목록</Label>
              {briefForm.rooms.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={r.name}
                    placeholder="공간명"
                    className="flex-1"
                    onChange={(e) => updateRoom(i, { name: e.target.value })}
                  />
                  <Select
                    value={r.type}
                    className="w-24"
                    onChange={(e) =>
                      updateRoom(i, { type: e.target.value as RoomType })
                    }
                  >
                    {ROOM_TYPES.map((rt) => (
                      <option key={rt.value} value={rt.value}>
                        {rt.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="폭(m)"
                    className="w-20"
                    value={r.widthM}
                    onChange={(e) => updateRoom(i, { widthM: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="길이(m)"
                    className="w-20"
                    value={r.lengthM}
                    onChange={(e) => updateRoom(i, { lengthM: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRoom(i)}
                    aria-label="공간 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addRoom}>
                <Plus className="h-4 w-4" />
                공간 추가
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setStep("input")}
              className="flex-1"
            >
              이전
            </Button>
            <Button
              onClick={generate}
              disabled={
                busy ||
                briefForm.rooms.filter((r) => r.name.trim()).length === 0
              }
              className="flex-1"
            >
              {busy ? "제안 생성 중..." : "제안 생성하기"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === "result" && data && <PresentationView data={data} />}
    </main>
  );
}
