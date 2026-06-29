"use client";

/**
 * components/proposal/floorplan-sheet.tsx
 * 도식 SVG 평면도 + "AI 평면도 변환"(레퍼런스급 포토리얼 평면도).
 * SVG를 PNG로 래스터화 → /api/proposal/render(kind:"floorplan") img2img.
 * 키 있으면 자동 변환, 없으면 도식 평면도 유지(폴백).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { renderPlanSvg } from "@/lib/proposal/floorplan-svg";
import type { ApartmentTemplate } from "@/lib/types";

function svgDims(svg: string): { w: number; h: number } {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  return m ? { w: Math.round(+m[1]!), h: Math.round(+m[2]!) } : { w: 800, h: 600 };
}

/** SVG 문자열 → PNG dataURL (AI img2img 입력용). */
function svgToPng(svg: string): Promise<string> {
  const { w, h } = svgDims(svg);
  const sized = svg.replace('width="100%"', `width="${w}" height="${h}"`);
  return new Promise((resolve, reject) => {
    const blob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas ctx 없음"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG 로드 실패"));
    };
    img.src = url;
  });
}

export function FloorplanSheet({
  template,
  title,
}: {
  template: ApartmentTemplate;
  title?: string;
}) {
  const svg = useMemo(() => renderPlanSvg(template, { title }), [template, title]);
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const autoTried = useRef(false);

  const beautify = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const png = await svgToPng(svg);
      const res = await fetch("/api/proposal/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: png, kind: "floorplan" }),
      });
      if (!res.ok) {
        setNote("AI 평면도 변환에 실패했습니다 — 도식 평면도를 표시합니다.");
        return;
      }
      const j = (await res.json()) as { imageUrl: string; mock: boolean; note?: string };
      setAiImage(j.imageUrl);
      if (j.mock && j.note) setNote(j.note);
    } catch {
      setNote("AI 평면도 변환 중 오류가 발생했습니다 — 도식 평면도를 표시합니다.");
    } finally {
      setBusy(false);
    }
  };

  // 키 설정 시 자동 실사 변환(없으면 호출 안 함)
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    fetch("/api/proposal/render")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => {
        if (j.available) void beautify();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2 print:hidden">
        {aiImage && (
          <button
            type="button"
            onClick={() => setAiImage(null)}
            className="rounded-md border border-hairline px-3 py-1.5 text-sm"
          >
            도식으로 보기
          </button>
        )}
        <button
          type="button"
          onClick={beautify}
          disabled={busy}
          className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "변환 중…" : "AI 평면도 변환"}
        </button>
      </div>
      {note && (
        <p className="rounded-md bg-paper px-3 py-2 text-xs text-muted-foreground print:hidden">
          {note}
        </p>
      )}
      <div className="relative w-full overflow-hidden rounded-xl border border-hairline bg-white">
        {aiImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={aiImage} alt="AI 실사 평면도" className="w-full" />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-sm font-medium text-white">
            AI 평면도 생성 중…
          </div>
        )}
      </div>
    </div>
  );
}
