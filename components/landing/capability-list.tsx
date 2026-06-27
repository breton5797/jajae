const ITEMS = [
  {
    n: "01",
    title: "전 카테고리 자재",
    desc: "타일·바닥재·도배·페인트·위생도기·조명·문/창호·주방부터 시멘트·철근·단열·석고보드·목재·방수·철물까지 한 곳에서.",
  },
  {
    n: "02",
    title: "AI 자재 물량산출",
    desc: "프로젝트 유형과 평수만 입력하면 AI가 필요한 자재 물량(BOM)을 자동 산출하고 예상 견적을 뽑아줍니다.",
  },
  {
    n: "03",
    title: "다중 공급사 통합주문",
    desc: "여러 공급사 자재를 장바구니에 담아 한 번에 주문하면 공급사별 발주서(PO)로 자동 분할됩니다.",
  },
  {
    n: "04",
    title: "현장별 통합 관리",
    desc: "현장 단위로 배송·반품·AS를 한눈에 추적하고 공정에 맞춰 일정을 관리하세요.",
  },
] as const;

export function CapabilityList() {
  return (
    <section
      aria-labelledby="capabilities-heading"
      className="border-b border-hairline"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-28">
        <h2
          id="capabilities-heading"
          className="max-w-2xl text-3xl font-bold tracking-tight text-ink sm:text-4xl"
        >
          현장 하나를 끝내는 데 필요한 모든 것
        </h2>
        <dl className="mt-16 grid grid-cols-1 gap-x-12 gap-y-14 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <div key={it.n} className="border-t border-hairline pt-6">
              <span className="block text-sm font-semibold tabular-nums tracking-widest text-brand">
                {it.n}
              </span>
              <dt className="mt-4 text-xl font-semibold text-ink">{it.title}</dt>
              <dd className="mt-3 text-base leading-relaxed text-muted-foreground">
                {it.desc}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
