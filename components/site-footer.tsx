import Link from "next/link";

const COLUMNS = [
  {
    title: "제품",
    links: [
      { label: "카탈로그", href: "/catalog" },
      { label: "AI 견적", href: "/ai-quote" },
      { label: "공동구매", href: "/group-buy" },
      { label: "시세", href: "/price-intelligence" },
      { label: "현장 관리", href: "/sites" },
    ],
  },
  {
    title: "지원",
    links: [
      { label: "커뮤니티", href: "/community" },
      { label: "발주예측", href: "/forecast" },
      { label: "정산", href: "/finance" },
    ],
  },
  {
    title: "시작하기",
    links: [
      { label: "사업자 인증", href: "/login" },
      { label: "대시보드", href: "/dashboard" },
      { label: "도면 견적", href: "/drawing" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-paper">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5 font-extrabold text-ink">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white">
                자
              </span>
              <span className="text-lg tracking-tight">자재</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              인테리어부터 건축까지, 현장 자재를 한 곳에서.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-ink hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 border-t border-hairline pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} 자재. 인테리어·건축자재 통합 플랫폼.
        </div>
      </div>
    </footer>
  );
}
