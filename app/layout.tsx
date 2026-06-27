import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "자재 — B2B 인테리어·건축자재 플랫폼",
  description:
    "시공사를 위한 인테리어·건축자재 통합 구매 플랫폼. 검색·AI 견적·다중공급사 통합주문·배송/반품/AS를 한 곳에서.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1A56DB",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <SiteHeader />
          <main className="container-app flex-1 py-5">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
