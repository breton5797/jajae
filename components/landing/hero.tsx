import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative border-b border-hairline"
    >
      <div
        aria-hidden
        className="blueprint-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-6 py-28 sm:py-36">
        <span className="inline-flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <span aria-hidden className="h-px w-8 bg-brand" />
          인테리어 + 건축 자재 통합 플랫폼
        </span>
        <h1
          id="hero-heading"
          className="mt-8 max-w-3xl text-balance text-5xl font-bold leading-[1.05] tracking-tight text-ink sm:text-7xl"
        >
          현장 자재,
          <br />한 번에.
        </h1>
        <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          인테리어부터 건축까지 전 자재를 통합 구매하세요. AI 물량산출(BOM)로 견적을
          뽑고, 다중 공급사를 한 번에 주문하면 발주서가 자동 분할됩니다.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/catalog">카탈로그 둘러보기</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/ai-quote">AI 견적 받기</Link>
          </Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            사업자 인증하고 시작하기 →
          </Link>
        </p>
      </div>
    </section>
  );
}
