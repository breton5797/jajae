// components/proposal/material-panel.tsx
/** 이미지 #1 우측 패널 — 자재 디테일 + 추가 사양 + 예산 요약. */
import type { FinishSelection } from "@/lib/types";

const KOR: Record<string, string> = {
  flooring: "마루",
  wallpaper: "벽지",
  paint: "벽면 마감",
  tile: "타일",
  window: "샷시/창호",
  door: "도어",
  kitchen: "싱크대",
  sanitaryware: "욕실",
  lighting: "조명",
  furniture: "붙박이장",
  molding: "몰딩/걸레받이",
  film: "필름",
  board: "보드",
  engineered_stone: "인조대리석",
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

// 패널 상단 5개(이미지 #1 자재 디테일), 나머지는 추가 사양
const PRIMARY = ["flooring", "window", "door", "furniture", "kitchen"];

export function MaterialPanel({
  finishes,
  materialsKRW,
  constructionKRW,
  totalKRW,
}: {
  finishes: FinishSelection[];
  materialsKRW: number;
  constructionKRW: number;
  totalKRW: number;
}) {
  const primary = PRIMARY.map((c) =>
    finishes.find((f) => f.category === c),
  ).filter(Boolean) as FinishSelection[];
  const extras = finishes.filter((f) => !PRIMARY.includes(f.category));

  return (
    <aside className="flex w-full flex-col gap-6 p-6">
      <section>
        <h3 className="mb-3 border-b-2 border-ink pb-1 text-lg font-bold">
          자재 디테일
        </h3>
        <ul className="flex flex-col gap-4">
          {primary.map((f) => (
            <li key={f.category} className="flex items-center gap-3">
              <span
                className="h-12 w-12 shrink-0 rounded-md border border-hairline"
                style={{
                  backgroundColor: f.material.color ?? "#E5E5E5",
                  backgroundImage: f.material.swatchUrl
                    ? `url(${f.material.swatchUrl})`
                    : undefined,
                  backgroundSize: "cover",
                }}
              />
              <div className="min-w-0">
                <p className="font-semibold">
                  {KOR[f.category] ?? f.category}
                  {f.downgraded && (
                    <span className="ml-2 text-xs text-amber-600">예산 조정</span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {f.material.brandName ?? ""} · {f.material.label}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {extras.length > 0 && (
        <section>
          <h3 className="mb-3 border-b-2 border-ink pb-1 text-lg font-bold">
            추가 사양
          </h3>
          <dl className="flex flex-col gap-2 text-sm">
            {extras.map((f) => (
              <div key={f.category} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">
                  {KOR[f.category] ?? f.category}
                </dt>
                <dd className="text-right">
                  {f.material.brandName ?? ""} {f.material.label}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-auto rounded-lg bg-paper p-4">
        <div className="flex justify-between text-sm">
          <span>자재비</span>
          <span>{won(materialsKRW)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>시공비</span>
          <span>{won(constructionKRW)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-hairline pt-2 text-base font-bold">
          <span>예상 총액</span>
          <span>{won(totalKRW)}</span>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          ※ 대표가 기준 개략 견적. 실제 견적은 현장 실측 후 확정됩니다.
        </p>
      </section>
    </aside>
  );
}
