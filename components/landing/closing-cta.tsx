import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section aria-labelledby="closing-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-28 text-center sm:py-32">
        <h2
          id="closing-heading"
          className="text-3xl font-bold tracking-tight text-ink sm:text-5xl"
        >
          지금 바로 견적을 받아보세요
        </h2>
        <p className="mx-auto mt-5 max-w-md text-base text-muted-foreground">
          AI가 현장에 필요한 자재 물량을 1분 만에 산출합니다.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/ai-quote">AI 견적 받기</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/catalog">카탈로그 둘러보기</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
