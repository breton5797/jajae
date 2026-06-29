"use client";

/**
 * components/proposal/yeongnim-match.tsx
 * 영림 토탈 인테리어 컬러 매치 — 컬러 1개 선택 시 도어/키친/마루/필름 모델코드 + 샘플단가 제시,
 * "제안 적용" 시 부모(proposal-sheet)가 예산/3D 색에 반영. material_catalog_items(0019/0020) 기반.
 */
import { useEffect, useState } from "react";
import type { ApartmentTemplate } from "@/lib/types";
import type { YeongnimColor } from "@/lib/proposal/yeongnim";
import { priceYeongnimColor, OVERLAY_CATEGORIES } from "@/lib/proposal/apply-yeongnim";

const CAT_KO: Record<string, string> = {
  flooring: "마루", door: "도어", kitchen: "키친", furniture: "수납",
  film: "인테리어필름", wallpanel: "월판넬",
};
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const isBudgetCat = (c: string) => (OVERLAY_CATEGORIES as string[]).includes(c);

export function YeongnimMatch({
  template,
  appliedSeries,
  onApply,
}: {
  template: ApartmentTemplate;
  appliedSeries: string | null;
  onApply: (color: YeongnimColor | null) => void;
}) {
  const [colors, setColors] = useState<YeongnimColor[]>([]);
  const [group, setGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/catalog/yeongnim")
      .then((r) => (r.ok ? r.json() : { colors: [] }))
      .then((j: { colors?: YeongnimColor[] }) => {
        if (!alive) return;
        const cs = j.colors ?? [];
        setColors(cs);
        setLoaded(true);
        if (cs.length) {
          setGroup(cs[0]!.patternGroup);
          setSelected(cs[0]!.series);
        }
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  if (loaded && colors.length === 0) return null;

  const groups = Array.from(new Set(colors.map((c) => c.patternGroup)));
  const inGroup = colors.filter((c) => c.patternGroup === group);
  const sel = colors.find((c) => c.series === selected);
  const priced = sel ? priceYeongnimColor(sel, template) : null;
  const isApplied = !!sel && appliedSeries === sel.series;

  return (
    <section className="rounded-xl border border-hairline p-4 print:hidden">
      <header className="mb-3">
        <h3 className="text-lg font-bold">영림 토탈 인테리어 컬러 매치</h3>
        <p className="text-xs text-muted-foreground">
          한 가지 컬러로 도어·키친·마루·필름까지 통일 — 영림 e카탈로그 기준. 제안 적용 시 예산·3D에 반영.
        </p>
      </header>

      {!loaded ? (
        <div className="h-28 animate-pulse rounded bg-paper" />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGroup(g);
                  const first = colors.find((c) => c.patternGroup === g);
                  if (first) setSelected(first.series);
                }}
                className={`rounded-full px-3 py-1 text-xs ${
                  group === g ? "bg-ink text-white" : "bg-paper"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {inGroup.map((c) => (
              <button
                key={c.series}
                type="button"
                onClick={() => setSelected(c.series)}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                  selected === c.series
                    ? "border-ink bg-ink text-white"
                    : "border-hairline hover:bg-paper"
                }`}
              >
                {c.color && (
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-black/10"
                    style={{ backgroundColor: c.color }}
                  />
                )}
                {c.series}
              </button>
            ))}
          </div>

          {sel && priced && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {sel.series}{" "}
                  <span className="text-xs font-normal text-muted-foreground">· 통일 적용 시 추천 자재</span>
                </p>
                <button
                  type="button"
                  onClick={() => onApply(isApplied ? null : sel)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    isApplied
                      ? "border border-hairline"
                      : "bg-brand text-white hover:bg-brand-600"
                  }`}
                >
                  {isApplied ? "적용 해제" : "이 컬러로 제안 적용"}
                </button>
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {priced.items.map((it) => (
                  <div
                    key={it.category}
                    className="flex items-baseline justify-between gap-2 border-b border-hairline/60 py-1"
                  >
                    <dt className="text-muted-foreground">
                      {CAT_KO[it.category] ?? it.category}
                      <span className="ml-1 text-xs text-muted-foreground/70">{it.modelCode}</span>
                    </dt>
                    <dd className={isBudgetCat(it.category) ? "font-medium" : "text-muted-foreground"}>
                      {it.qty > 0 ? won(it.lineTotal) : "—"}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-sm font-semibold">
                <span>영림 자재 합계(마루·도어·키친·수납)</span>
                <span>{won(priced.subtotal)}</span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                ※ 단가는 예상 샘플(영림 카탈로그 미포함) — 실공급가 확보 시 수정.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
