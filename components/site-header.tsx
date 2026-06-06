"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, LayoutDashboard, Sparkles, Boxes } from "lucide-react";
import { useCart } from "@/lib/store/cart";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/catalog", label: "카탈로그", icon: Boxes },
  { href: "/ai-quote", label: "AI견적", icon: Sparkles },
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
];

export function SiteHeader() {
  const pathname = usePathname();
  const count = useCart((s) => s.lines.length);

  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="container-app flex h-14 items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-1.5 font-extrabold">
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
                  "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                  active && "bg-brand-50 text-brand-700",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <Link
            href="/cart"
            className={cn(
              "relative flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              pathname.startsWith("/cart") && "bg-brand-50 text-brand-700",
            )}
          >
            <ShoppingCart className="h-4 w-4" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}
