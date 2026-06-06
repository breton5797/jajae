export const dynamic = "force-dynamic";

import Link from "next/link";
import { loadAdminConsole } from "@/lib/data/admin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";
import {
  BIZ_STATUS_LABEL,
  PRODUCT_STATUS_LABEL,
  RETURN_STATUS_LABEL,
} from "@/lib/labels";

export default async function AdminPage() {
  const a = await loadAdminConsole();

  if (!a.authed) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>관리자 로그인 필요</CardTitle>
            <CardDescription>
              관리자 콘솔에 접근하려면 로그인이 필요합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login">로그인</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold">관리자 콘솔</h1>
      <p className="mb-6 text-sm text-gray-500">
        승인 처리는 관리자 API를 통해 수행됩니다. (MVP 조회 화면)
      </p>

      <div className="flex flex-col gap-4">
        {/* (1) 공급사 인증 대기 */}
        <Card>
          <CardHeader>
            <CardTitle>공급사 인증 대기 ({a.pendingSuppliers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {a.pendingSuppliers.length === 0 ? (
              <p className="text-sm text-gray-400">대기 중인 공급사가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {a.pendingSuppliers.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-sm text-gray-500">{s.biz_no}</p>
                    </div>
                    <Badge variant="warning">
                      {BIZ_STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* (2) 상품 승인 대기 */}
        <Card>
          <CardHeader>
            <CardTitle>상품 승인 대기 ({a.pendingProducts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {a.pendingProducts.length === 0 ? (
              <p className="text-sm text-gray-400">대기 중인 상품이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {a.pendingProducts.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-sm text-gray-500">
                        {p.brand} · {formatKRW(p.unit_price)}
                      </p>
                    </div>
                    <Badge variant="warning">
                      {PRODUCT_STATUS_LABEL[p.status] ?? p.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* (3) 반품/AS 중재 */}
        <Card>
          <CardHeader>
            <CardTitle>반품/AS 중재 ({a.openReturns.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {a.openReturns.length === 0 ? (
              <p className="text-sm text-gray-400">중재 대기 건이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {a.openReturns.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.reason}</p>
                      <p className="text-sm text-gray-500">수량 {r.qty}</p>
                    </div>
                    <Badge variant="neutral">
                      {RETURN_STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
