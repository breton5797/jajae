import Link from "next/link";
import { Button } from "@/components/ui/button";

const ROWS = [
  { name: "타일 (600×600)", qty: "24 박스" },
  { name: "방수 시트", qty: "8 롤" },
  { name: "석고보드 (9.5T)", qty: "36 장" },
] as const;

export function AiQuoteSpotlight() {
  return (
    <section
      aria-labelledby="ai-quote-heading"
      className="border-b border-hairline"
    >
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 py-24 sm:py-28 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            AI 물량산출
          </span>
          <h2
            id="ai-quote-heading"
            className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          >
            평수만 입력하면, AI가 물량을 산출합니다
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            프로젝트 유형과 면적을 입력하면 자재 물량(BOM)과 예상 견적을 1분 만에
            받아볼 수 있습니다. 도면을 올리면 더 정밀해집니다.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/ai-quote">AI 견적 받기</Link>
            </Button>
          </div>
        </div>
        <div
          aria-hidden
          className="rounded-lg border border-hairline bg-white p-6 font-mono text-sm shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-hairline pb-3 text-xs text-muted-foreground">
            <span>BOM 산출 결과</span>
            <span>예시</span>
          </div>
          <ul className="mt-4 space-y-2">
            {ROWS.map((r) => (
              <li key={r.name} className="flex justify-between">
                <span>{r.name}</span>
                <span className="tabular-nums">{r.qty}</span>
              </li>
            ))}
            <li className="flex justify-between border-t border-hairline pt-3 font-semibold text-ink">
              <span>예상 견적</span>
              <span className="tabular-nums">₩ 3,480,000</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
