export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";
import {
  ORDER_STATUS_LABEL,
  DELIVERY_STATUS_LABEL,
  RETURN_STATUS_LABEL,
  AS_STATUS_LABEL,
  deliveryVariant,
} from "@/lib/labels";
import { loadContractorDashboard } from "@/lib/data/dashboard";
import { loadDashboardWidgets } from "@/lib/data/widgets";
import { BudgetBar } from "@/components/budget-bar";
import type { Delivery } from "@/lib/types";

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-gray-500">{text}</p>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return iso.slice(0, 10);
}

export default async function DashboardPage() {
  const d = await loadContractorDashboard();
  const w = await loadDashboardWidgets();

  if (!d.authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>로그인이 필요합니다</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login">로그인하기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // site_id -> site name lookup (noUncheckedIndexedAccess-safe via Map.get)
  const siteName = new Map<string, string>();
  for (const s of d.sites) {
    siteName.set(s.id, s.name);
  }

  // group deliveries by site (null -> 미지정 현장)
  const UNASSIGNED = "미지정 현장";
  const deliveriesByGroup = new Map<string, Delivery[]>();
  for (const del of d.deliveries) {
    const key = del.site_id ? siteName.get(del.site_id) ?? UNASSIGNED : UNASSIGNED;
    const list = deliveriesByGroup.get(key) ?? [];
    deliveriesByGroup.set(key, [...list, del]);
  }
  const deliveryGroups = Array.from(deliveriesByGroup.entries());

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold">대시보드</h1>

      {/* Phase 2 인텔리전스 위젯 */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">전체 예산 소진</CardTitle>
          </CardHeader>
          <CardContent>
            <BudgetBar
              budget={{
                budget: w.totalBudget,
                spent: w.totalSpent,
                remaining: w.totalBudget - w.totalSpent,
                burnRatio: w.burnRatio,
                overBudget: w.totalSpent > w.totalBudget && w.totalBudget > 0,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">배송 예정</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {w.pendingDeliveries.length}
              <span className="ml-1 text-sm font-normal text-gray-500">건</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">최저가 알림</CardTitle>
          </CardHeader>
          <CardContent>
            {w.alerts.length === 0 ? (
              <p className="text-sm text-gray-500">절감 기회 없음</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {w.alerts.slice(0, 3).map((a) => (
                  <li key={a.productId}>
                    {a.productName} →{" "}
                    <span className="font-semibold text-brand-700">
                      {formatKRW(a.savings)} 절감
                    </span>{" "}
                    ({a.savingsPct}%)
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/price-intelligence"
              className="mt-1 inline-block text-xs text-brand hover:underline"
            >
              가격 비교 →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {/* (1) 주문 현황 */}
        <Card>
          <CardHeader>
            <CardTitle>주문 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {d.orders.length === 0 ? (
              <EmptyState text="아직 주문 내역이 없습니다." />
            ) : (
              <ul className="flex flex-col gap-3">
                {d.orders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">
                        #{o.id.slice(0, 8)}
                      </span>
                      <span className="text-gray-500">
                        {fmtDate(o.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge>{ORDER_STATUS_LABEL[o.status]}</Badge>
                      <span className="font-semibold">
                        {formatKRW(o.total)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* (2) 현장별 배송 */}
        <Card>
          <CardHeader>
            <CardTitle>현장별 배송</CardTitle>
          </CardHeader>
          <CardContent>
            {deliveryGroups.length === 0 ? (
              <EmptyState text="예정된 배송이 없습니다." />
            ) : (
              <div className="flex flex-col gap-4">
                {deliveryGroups.map(([group, list]) => (
                  <div key={group} className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-brand-700">
                      {group}
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {list.map((del) => (
                        <li
                          key={del.id}
                          className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                        >
                          <span className="text-gray-500">
                            {fmtDate(del.scheduled_date)}
                          </span>
                          <Badge variant={deliveryVariant(del.status)}>
                            {DELIVERY_STATUS_LABEL[del.status]}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* (3) 반품/교환 */}
        <Card>
          <CardHeader>
            <CardTitle>반품/교환</CardTitle>
          </CardHeader>
          <CardContent>
            {d.returns.length === 0 ? (
              <EmptyState text="반품/교환 요청이 없습니다." />
            ) : (
              <ul className="flex flex-col gap-3">
                {d.returns.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{r.reason}</span>
                      <span className="text-gray-500">수량 {r.qty}</span>
                    </div>
                    <Badge>{RETURN_STATUS_LABEL[r.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* (4) A/S */}
        <Card>
          <CardHeader>
            <CardTitle>A/S</CardTitle>
          </CardHeader>
          <CardContent>
            {d.asRequests.length === 0 ? (
              <EmptyState text="A/S 요청이 없습니다." />
            ) : (
              <ul className="flex flex-col gap-3">
                {d.asRequests.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{a.issue}</span>
                      <span className="text-gray-500">
                        방문 예정 {fmtDate(a.scheduled_date)}
                      </span>
                    </div>
                    <Badge>{AS_STATUS_LABEL[a.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
