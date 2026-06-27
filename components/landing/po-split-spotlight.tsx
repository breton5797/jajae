import Link from "next/link";
import { Button } from "@/components/ui/button";

const CART = ["타일 · A 공급사", "방수재 · B 공급사", "철물 · C 공급사"] as const;
const POS = [
  { id: "발주서 #A", supplier: "A 공급사" },
  { id: "발주서 #B", supplier: "B 공급사" },
  { id: "발주서 #C", supplier: "C 공급사" },
] as const;

export function PoSplitSpotlight() {
  return (
    <section
      aria-labelledby="po-split-heading"
      className="border-b border-hairline"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-28">
        <div className="max-w-2xl">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            통합주문
          </span>
          <h2
            id="po-split-heading"
            className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          >
            한 번의 주문, 공급사별 발주서로 자동 분할
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            여러 공급사의 자재를 한 장바구니에 담아 주문하면, 시스템이 공급사별
            발주서(PO)로 나눠 전송합니다. 발주·입고·정산이 따로 놀지 않습니다.
          </p>
        </div>
        <div
          aria-hidden
          className="mt-12 grid grid-cols-1 items-stretch gap-6 sm:grid-cols-[1fr_auto_1fr]"
        >
          <div className="rounded-lg border border-hairline bg-white p-6">
            <p className="text-sm font-semibold text-ink">장바구니</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {CART.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-center text-2xl text-muted-foreground">
            <span className="hidden sm:inline">→</span>
            <span className="sm:hidden">↓</span>
          </div>
          <div className="space-y-3">
            {POS.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-hairline bg-white p-4 text-sm"
              >
                <span className="font-semibold text-ink">{p.id}</span> ·{" "}
                {p.supplier}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10">
          <Button asChild size="lg" variant="outline">
            <Link href="/catalog">카탈로그 둘러보기</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
