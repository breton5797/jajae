export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";
import {
  BIZ_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
  PO_STATUS_LABEL,
  UNIT_LABEL,
  poVariant,
} from "@/lib/labels";
import { loadSupplierConsole } from "@/lib/data/supplier";

export default async function SupplierPage() {
  const c = await loadSupplierConsole();

  if (!c.authed) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>로그인이 필요합니다</CardTitle>
            <CardDescription>
              공급사 콘솔을 이용하려면 먼저 로그인해 주세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login">로그인하러 가기</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!c.supplier) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>승인 대기 중</CardTitle>
            <CardDescription>
              공급사 계정 등록 대기 중입니다. 관리자 승인 후 이용 가능합니다.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const supplier = c.supplier;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{supplier.name}</h1>
        <Badge variant="neutral">{BIZ_STATUS_LABEL[supplier.status]}</Badge>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">상품 관리</h2>
        {c.products.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              등록된 상품이 없습니다
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {c.products.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-gray-500">{p.brand}</p>
                  </div>
                  <Badge variant="neutral">
                    {PRODUCT_STATUS_LABEL[p.status]}
                  </Badge>
                  <div className="text-right">
                    <p className="font-medium">
                      {formatKRW(p.unit_price)}/ {UNIT_LABEL[p.unit] ?? p.unit}
                    </p>
                    <p className="text-gray-500">
                      재고 {p.stock} · 리드타임 {p.lead_time_days}일
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">발주(PO) 처리</h2>
        {c.purchaseOrders.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-500">
              처리할 발주가 없습니다
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {c.purchaseOrders.map((po) => (
              <Card key={po.id}>
                <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      PO #{po.id.slice(0, 8)}
                    </p>
                    <p className="text-gray-500">
                      출고예정 {po.expected_ship_date ?? "-"}
                    </p>
                  </div>
                  <Badge variant={poVariant(po.status)}>
                    {PO_STATUS_LABEL[po.status]}
                  </Badge>
                  <div className="text-right font-medium">
                    {formatKRW(po.subtotal)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
