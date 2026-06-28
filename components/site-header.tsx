"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  LayoutDashboard,
  Sparkles,
  Boxes,
  TrendingUp,
  Building2,
  Users,
  Receipt,
  FileImage,
  MessageSquare,
  LineChart,
  ClipboardList,
  Box,
  Presentation,
} from "lucide-react";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/catalog", label: "카탈로그", icon: Boxes },
  { href: "/drawing", label: "도면견적", icon: FileImage },
  { href: "/ai-quote", label: "AI견적", icon: Sparkles },
  { href: "/estimate", label: "견적서", icon: ClipboardList },
  { href: "/studio", label: "3D스튜디오", icon: Box },
  { href: "/proposal", label: "즉석 제안", icon: Presentation },
  { href: "/group-buy", label: "공동구매", icon: Users },
  { href: "/community", label: "커뮤니티", icon: MessageSquare },
  { href: "/forecast", label: "발주예측", icon: LineChart },
  { href: "/price-intelligence", label: "시세", icon: TrendingUp },
  { href: "/sites", label: "현장", icon: Building2 },
  { href: "/finance", label: "정산", icon: Receipt },
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
];

export function SiteHeader() {
  const pathname = usePathname();
  const count = useCart((s) => s.lines.length);

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 font-extrabold text-ink"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white">
            자
          </span>
          <span className="text-lg tracking-tight">자재</span>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-ink",
                  active && "text-ink",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 -bottom-[1px] h-0.5 bg-brand"
                  />
                )}
              </Link>
            );
          })}
          <Link
            href="/cart"
            className={cn(
              "relative flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-ink",
              pathname.startsWith("/cart") && "text-ink",
            )}
          >
            <ShoppingCart className="h-4 w-4" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
          <Link
            href="/login"
            className="ml-1 hidden rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-muted sm:inline-flex"
          >
            로그인
          </Link>
        </nav>
      </div>
    </header>
  );
}
