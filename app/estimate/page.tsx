"use client";

/**
 * app/estimate/page.tsx
 * 4-step wizard: 상담 입력 → 브리프 검토 → 결과 → 저장 완료
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
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
import { FloorPlan2D } from "@/components/estimate/floorplan-2d";
import { formatKRW } from "@/lib/utils";
import { UNIT_LABEL } from "@/lib/labels";
import { fileToBase64 } from "@/lib/storage";
import type {
  BomResult,
  EstimateBrief,
  FloorPlan,
  ProjectType,
  RoomType,
  SpecLevel,
} from "@/lib/types";

/** 3D viewer: loaded client-side only to prevent Three.js SSR. */
const FloorPlan3DView = dynamic(
  () =>
    import("@/components/estimate/floorplan-3d").then((m) => m.FloorPlan3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-lg border border-hairline bg-paper text-sm text-muted-foreground">
        3D 미리보기 로딩 중...
      </div>
    ),
  },
);

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

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "input" | "brief" | "result" | "done";

type RoomFormEntry = {
  name: string;
  type: RoomType;
  widthM: string;
  lengthM: string;
};

type BriefFormState = {
  projectType: ProjectType;
  specLevel: SpecLevel;
  rooms: RoomFormEntry[];
  budgetKRW: string;
};

type EstimateResultState = {
  id: string;
  floorPlan: FloorPlan;
  bom: BomResult;
  totalKRW: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultBriefForm(): BriefFormState {
  return {
    projectType: "apartment_remodel",
    specLevel: "standard",
    rooms: [{ name: "거실", type: "living", widthM: "5", lengthM: "4" }],
    budgetKRW: "",
  };
}

function apiBriefToForm(brief: EstimateBrief): BriefFormState {
  return {
    projectType: brief.projectType,
    specLevel: brief.specLevel,
    rooms: brief.rooms.map((r) => ({
      name: r.name,
      type: r.type,
      widthM: String(r.widthM),
      lengthM: String(r.lengthM),
    })),
    budgetKRW: brief.budgetKRW != null ? String(brief.budgetKRW) : "",
  };
}

function formToBrief(form: BriefFormState): EstimateBrief {
  return {
    projectType: form.projectType,
    specLevel: form.specLevel,
    rooms: form.rooms
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        name: r.name.trim(),
        type: r.type,
        widthM: Math.max(0, parseFloat(r.widthM) || 0),
        lengthM: Math.max(0, parseFloat(r.lengthM) || 0),
      })),
    budgetKRW: form.budgetKRW ? parseInt(form.budgetKRW, 10) : undefined,
  };
}

// ─── Stepper indicator ────────────────────────────────────────────────────────

const STEPS: { key: WizardStep; label: string }[] = [
  { key: "input", label: "상담 입력" },
  { key: "brief", label: "브리프 검토" },
  { key: "result", label: "결과" },
  { key: "done", label: "저장 완료" },
];

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-1 text-xs">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1">
          <span
            className={
              i === currentIdx
                ? "font-bold text-brand"
                : i < currentIdx
                  ? "text-brand-400"
                  : "text-muted-foreground"
            }
          >
            {i + 1}. {s.label}
          </span>
          {i < STEPS.length - 1 && (
            <span className="text-hairline">›</span>
          )}
        </li>
      ))}
    </ol>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EstimatePage() {
  const [step, setStep] = useState<WizardStep>("input");

  // Step 1 state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Step 2 state
  const [briefForm, setBriefForm] = useState<BriefFormState>(defaultBriefForm());

  // Step 3 / done state
  const [estimateResult, setEstimateResult] =
    useState<EstimateResultState | null>(null);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1 handlers ─────────────────────────────────────────────────────────

  function handleAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setAudioFile(file);
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

  async function handleProceedToBrief() {
    setLoading(true);
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
      setLoading(false);
    }
  }

  // ── Step 2 handlers ─────────────────────────────────────────────────────────

  function updateRoom(i: number, patch: Partial<RoomFormEntry>) {
    setBriefForm((f) => ({
      ...f,
      rooms: f.rooms.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  }

  function addRoom() {
    setBriefForm((f) => ({
      ...f,
      rooms: [
        ...f.rooms,
        { name: "", type: "room" as RoomType, widthM: "3", lengthM: "3" },
      ],
    }));
  }

  function removeRoom(i: number) {
    setBriefForm((f) => ({
      ...f,
      rooms: f.rooms.filter((_, idx) => idx !== i),
    }));
  }

  async function handleGenerateEstimate() {
    setLoading(true);
    setError(null);
    try {
      const brief = formToBrief(briefForm);
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, transcript }),
      });
      if (res.status === 401) {
        setError("LOGIN_REQUIRED");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "견적 생성에 실패했습니다.");
        return;
      }
      setEstimateResult(json as EstimateResultState);
      setStep("result");
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────────

  function handleReset() {
    setStep("input");
    setAudioFile(null);
    setTranscript("");
    setTranscribeError(null);
    setBriefForm(defaultBriefForm());
    setEstimateResult(null);
    setError(null);
  }

  // ── Renders ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-brand-700">AI 인테리어 견적서</h1>
        <p className="text-sm text-muted-foreground">
          상담 음성 또는 텍스트 입력 → 평면도 + 자재 BOM + 견적 총액 자동 생성
        </p>
        <StepIndicator current={step} />
      </div>

      {step === "input" && (
        <StepInput
          audioFile={audioFile}
          transcript={transcript}
          transcribing={transcribing}
          transcribeError={transcribeError}
          loading={loading}
          error={error}
          onAudioChange={handleAudioChange}
          onTranscribe={handleTranscribe}
          onTranscriptChange={setTranscript}
          onNext={handleProceedToBrief}
        />
      )}

      {step === "brief" && (
        <StepBrief
          form={briefForm}
          loading={loading}
          error={error}
          onUpdateRoom={updateRoom}
          onAddRoom={addRoom}
          onRemoveRoom={removeRoom}
          onFormChange={setBriefForm}
          onBack={() => setStep("input")}
          onGenerate={handleGenerateEstimate}
        />
      )}

      {step === "result" && estimateResult && (
        <StepResult
          result={estimateResult}
          onNext={() => setStep("done")}
        />
      )}

      {step === "done" && estimateResult && (
        <StepDone
          estimateId={estimateResult.id}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

// ─── Step sub-components ──────────────────────────────────────────────────────

interface StepInputProps {
  audioFile: File | null;
  transcript: string;
  transcribing: boolean;
  transcribeError: string | null;
  loading: boolean;
  error: string | null;
  onAudioChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTranscribe: () => void;
  onTranscriptChange: (v: string) => void;
  onNext: () => void;
}

function StepInput({
  audioFile,
  transcript,
  transcribing,
  transcribeError,
  loading,
  error,
  onAudioChange,
  onTranscribe,
  onTranscriptChange,
  onNext,
}: StepInputProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>1단계 · 상담 내용 입력</CardTitle>
        <CardDescription>
          상담 음성 파일을 업로드하거나, 상담 내용을 직접 입력하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Audio upload */}
        <div className="space-y-2">
          <Label>음성 파일 업로드 (선택)</Label>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-hairline py-5 text-sm text-muted-foreground hover:bg-muted">
            <Upload className="h-5 w-5 shrink-0" />
            <span>{audioFile?.name ?? "MP3 / WAV / M4A / WebM (최대 25MB)"}</span>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={onAudioChange}
            />
          </label>
          {audioFile && (
            <Button
              variant="outline"
              size="sm"
              onClick={onTranscribe}
              disabled={transcribing}
            >
              {transcribing ? "전사 중..." : "AI 자동 전사"}
            </Button>
          )}
          {transcribeError && (
            <p className="text-sm text-destructive">{transcribeError}</p>
          )}
        </div>

        {/* Manual transcript */}
        <div className="space-y-1.5">
          <Label htmlFor="transcript">상담 내용 (직접 입력 또는 전사 결과 편집)</Label>
          <textarea
            id="transcript"
            className="min-h-32 w-full resize-y rounded-md border border-input bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="예) 25평 아파트 전체 리모델링 원합니다. 방 3개, 욕실 2개…"
            value={transcript}
            onChange={(e) => onTranscriptChange(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter>
        <Button
          onClick={onNext}
          disabled={transcript.trim().length === 0 || loading}
          className="w-full"
        >
          {loading ? "브리프 추출 중..." : "다음 — 브리프 검토"}
        </Button>
      </CardFooter>
    </Card>
  );
}

interface StepBriefProps {
  form: BriefFormState;
  loading: boolean;
  error: string | null;
  onUpdateRoom: (i: number, patch: Partial<RoomFormEntry>) => void;
  onAddRoom: () => void;
  onRemoveRoom: (i: number) => void;
  onFormChange: (f: BriefFormState) => void;
  onBack: () => void;
  onGenerate: () => void;
}

function StepBrief({
  form,
  loading,
  error,
  onUpdateRoom,
  onAddRoom,
  onRemoveRoom,
  onFormChange,
  onBack,
  onGenerate,
}: StepBriefProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>2단계 · 브리프 검토 및 수정</CardTitle>
        <CardDescription>
          AI가 추출한 내용을 확인하고 필요하면 수정하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Project basics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="projectType">공사 유형</Label>
            <Select
              id="projectType"
              value={form.projectType}
              onChange={(e) =>
                onFormChange({
                  ...form,
                  projectType: e.target.value as ProjectType,
                })
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
              value={form.specLevel}
              onChange={(e) =>
                onFormChange({ ...form, specLevel: e.target.value as SpecLevel })
              }
            >
              {SPEC_LEVELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="budgetKRW">예산 (원, 선택)</Label>
            <Input
              id="budgetKRW"
              type="number"
              min={0}
              step={1000000}
              placeholder="예: 30000000"
              value={form.budgetKRW}
              onChange={(e) => onFormChange({ ...form, budgetKRW: e.target.value })}
            />
          </div>
        </div>

        {/* Room list */}
        <div className="space-y-2">
          <Label>공간 목록</Label>
          {form.rooms.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={r.name}
                placeholder="공간명"
                className="flex-1"
                onChange={(e) => onUpdateRoom(i, { name: e.target.value })}
              />
              <Select
                value={r.type}
                className="w-24"
                onChange={(e) =>
                  onUpdateRoom(i, { type: e.target.value as RoomType })
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
                onChange={(e) => onUpdateRoom(i, { widthM: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                step={0.5}
                placeholder="길이(m)"
                className="w-20"
                value={r.lengthM}
                onChange={(e) => onUpdateRoom(i, { lengthM: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemoveRoom(i)}
                aria-label="공간 삭제"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={onAddRoom}>
            <Plus className="h-4 w-4" />
            공간 추가
          </Button>
        </div>

        {error === "LOGIN_REQUIRED" ? (
          <p className="text-sm text-destructive">
            견적을 저장하려면{" "}
            <Link href="/login" className="underline">
              로그인
            </Link>
            이 필요합니다.
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">
          이전
        </Button>
        <Button
          onClick={onGenerate}
          disabled={loading || form.rooms.filter((r) => r.name.trim()).length === 0}
          className="flex-1"
        >
          {loading ? "견적 생성 중..." : "견적 생성하기"}
        </Button>
      </CardFooter>
    </Card>
  );
}

interface StepResultProps {
  result: EstimateResultState;
  onNext: () => void;
}

function StepResult({ result, onNext }: StepResultProps) {
  return (
    <div className="space-y-5">
      {/* 2D floor plan */}
      <Card>
        <CardHeader>
          <CardTitle>2D 평면도</CardTitle>
        </CardHeader>
        <CardContent>
          <FloorPlan2D plan={result.floorPlan} />
        </CardContent>
      </Card>

      {/* 3D preview */}
      <Card>
        <CardHeader>
          <CardTitle>3D 미리보기</CardTitle>
          <CardDescription>드래그로 시점을 변경할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent>
          <FloorPlan3DView plan={result.floorPlan} />
        </CardContent>
      </Card>

      {/* BOM table */}
      <Card>
        <CardHeader>
          <CardTitle>자재 내역 (BOM)</CardTitle>
          <CardDescription>
            총 {result.bom.lines.length}개 품목
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">카테고리</th>
                <th className="py-2 pr-3 font-medium">품목</th>
                <th className="py-2 pr-3 text-right font-medium">수량</th>
                <th className="py-2 pr-3 text-right font-medium">예상단가</th>
                <th className="py-2 text-right font-medium">예상금액</th>
              </tr>
            </thead>
            <tbody>
              {result.bom.lines.map((line, i) => (
                <tr
                  key={`${line.categorySlug}-${i}`}
                  className="border-b last:border-0"
                >
                  <td className="py-2 pr-3 text-muted-foreground">
                    {line.category}
                  </td>
                  <td className="py-2 pr-3">
                    {line.matchedProductName ?? line.item}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {line.qty} {UNIT_LABEL[line.unit] ?? line.unit}
                  </td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {formatKRW(line.estUnitPrice)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {formatKRW(line.estPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <div className="flex w-full items-center justify-between border-t pt-3">
            <span className="text-sm font-medium text-muted-foreground">
              총 견적금액 (VAT 별도)
            </span>
            <span className="text-lg font-bold text-brand-700">
              {formatKRW(result.totalKRW)}
            </span>
          </div>
          {result.bom.source === "fallback" && (
            <p className="text-xs text-muted-foreground">
              ※ 샘플 단가 기준 추정치입니다
            </p>
          )}
          <Button onClick={onNext} className="w-full">
            저장 완료 확인 →
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/proposal">제안서로 보기 →</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/studio?from=estimate&id=${result.id}`}>
              3D 스튜디오에서 편집 →
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

interface StepDoneProps {
  estimateId: string;
  onReset: () => void;
}

function StepDone({ estimateId, onReset }: StepDoneProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>저장 완료</CardTitle>
        <CardDescription>견적서가 성공적으로 저장되었습니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md bg-muted p-4 text-sm">
          <p className="text-muted-foreground">견적서 ID</p>
          <p className="mt-1 break-all font-mono font-medium text-ink">
            {estimateId}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          상태: <span className="font-medium text-ink">초안(draft)</span>
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={onReset} className="w-full">
          새 견적 작성
        </Button>
      </CardFooter>
    </Card>
  );
}
