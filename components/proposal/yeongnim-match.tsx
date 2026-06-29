"use client";

/**
 * components/proposal/yeongnim-match.tsx
 * 영림 토탈 인테리어 컬러 매치 — 컬러 1개 선택 시 도어/키친/마루/필름 등 영림 모델코드를 통일 제안.
 * material_catalog_items(0019) 기반. 가격 미포함(카탈로그 reference) → 코디네이션 제안 전용.
 * 카탈로그가 없으면(또는 비로그인) 섹션을 숨긴다.
 */
import { useEffect, useState } from "react";
import type { YeongnimColor } from "@/lib/proposal/yeongnim";

const CAT_KO: Record<string, string> = {
  flooring: "마루",
  door: "도어",
  kitchen: "키친",
  furniture: "수납",
  film: "인테리어필름",
  wallpanel: "월판넬",
};

export function YeongnimMatch() {
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

  return (
    <section className="rounded-xl border border-hairline p-4 print:hidden">
      <header className="mb-3">
        <h3 className="text-lg font-bold">영림 토탈 인테리어 컬러 매치</h3>
        <p className="text-xs text-muted-foreground">
          한 가지 컬러로 도어·키친·마루·필름까지 통일 — 영림 e카탈로그 기준 코디네이션 제안
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
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  selected === c.series
                    ? "border-ink bg-ink text-white"
                    : "border-hairline hover:bg-paper"
                }`}
              >
                {c.series}
              </button>
            ))}
          </div>

          {sel && (
            <div>
              <p className="mb-2 text-sm font-semibold">
                {sel.series}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · 영림 통일 적용 시 추천 자재
                </span>
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
                {sel.items.map((it) => (
                  <div
                    key={it.category}
                    className="flex justify-between gap-2 border-b border-hairline/60 py-1"
                  >
                    <dt className="text-muted-foreground">
                      {CAT_KO[it.category] ?? it.category}
                    </dt>
                    <dd className="font-medium">{it.modelCode}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[10px] text-muted-foreground">
                ※ 영림 카탈로그 모델코드. 단가는 별도 확정(카탈로그 미포함).
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
