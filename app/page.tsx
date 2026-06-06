import Link from "next/link";
import { Boxes, Sparkles, Split, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

type Feature = {
  icon: typeof Boxes;
  title: string;
  desc: string;
};

const FEATURES: Feature[] = [
  {
    icon: Boxes,
    title: "전 카테고리 자재",
    desc:
      "타일·바닥재·도배·페인트·위생도기·조명·문/창호·주방부터 " +
      "시멘트·철근·단열·석고보드·목재·방수·철물까지 한 곳에서.",
  },
  {
    icon: Sparkles,
    title: "AI 자재 물량산출",
    desc:
      "프로젝트 유형과 평수만 입력하면 AI가 필요한 자재 물량(BOM)을 " +
      "자동으로 산출하고 예상 견적을 뽑아줍니다.",
  },
  {
    icon: Split,
    title: "다중 공급사 통합주문",
    desc:
      "여러 공급사 자재를 장바구니에 담아 한 번에 주문하면 " +
      "공급사별 발주서(PO)로 자동 분할됩니다.",
  },
  {
    icon: Wrench,
    title: "현장별 통합 관리",
    desc:
      "현장 단위로 배송·반품·AS를 한눈에 추적하고 " +
      "공정에 맞춰 일정을 관리하세요.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-16">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-lg border border-brand bg-brand-50 px-5 py-12 sm:px-10 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand opacity-10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-brand opacity-10 blur-2xl"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">
            <Sparkles className="h-3.5 w-3.5" />
            인테리어 + 건축 자재 통합 플랫폼
          </span>
          <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight text-brand-700 sm:text-5xl">
            현장 자재, 한 번에.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-gray-600 sm:text-base">
            인테리어부터 건축까지 전 자재를 통합 구매하세요. AI 물량산출(BOM)로
            견적을 뽑고, 다중 공급사를 한 번에 주문하면 발주서가 자동 분할됩니다.
            현장별 배송·반품·AS까지 한곳에서 관리하세요.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/catalog">카탈로그 둘러보기</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/ai-quote">AI 견적 받기</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            <Link
              href="/login"
              className="font-medium text-brand-700 underline-offset-4 hover:underline"
            >
              사업자 인증하고 시작하기 →
            </Link>
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">
          왜 자재인가요?
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title}>
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="mt-3 text-base">
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {feature.desc}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0" />
              </Card>
            );
          })}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mt-10 rounded-lg border border-brand bg-white px-5 py-8 text-center sm:px-10">
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
          지금 바로 견적을 받아보세요
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          AI가 현장에 필요한 자재 물량을 1분 만에 산출합니다.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/ai-quote">AI 견적 받기</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/catalog">카탈로그 둘러보기</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
