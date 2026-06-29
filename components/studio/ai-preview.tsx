"use client";

/**
 * components/studio/ai-preview.tsx
 * AI 실사 프리뷰 모달 — 뷰포트 스냅샷을 도메인 맞춤 포토리얼로 변환한 결과를 표시.
 * 로딩(생성 90~165초) / 오류 / 결과(이미지 + 안내 + 다운로드) 상태를 다룬다.
 */

export interface AiPreviewState {
  open: boolean;
  loading: boolean;
  imageUrl?: string;
  note?: string;
  error?: string;
}

export interface AiPreviewProps extends AiPreviewState {
  onClose: () => void;
}

export function AiPreview({ open, loading, imageUrl, note, error, onClose }: AiPreviewProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="AI 실사 프리뷰"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-paper p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">AI 실사 프리뷰</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-hairline px-2 py-1 text-xs text-ink transition-colors hover:bg-muted"
          >
            닫기
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p>실사 이미지를 생성하고 있어요…</p>
            <p className="text-xs">고품질은 90~165초까지 걸릴 수 있습니다.</p>
          </div>
        )}

        {!loading && error && (
          <p className="py-12 text-center text-sm text-red-600">{error}</p>
        )}

        {!loading && !error && imageUrl && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="AI 실사 렌더 결과"
              className="w-full rounded border border-hairline"
            />
            {note && <p className="text-xs text-muted-foreground">{note}</p>}
            <a
              href={imageUrl}
              download="studio-ai.png"
              className="inline-block rounded bg-brand px-3 py-1.5 text-sm font-medium text-white"
            >
              이미지 다운로드
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
