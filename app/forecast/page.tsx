import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReorderDraftButton, ReorderRuleForm } from "@/components/reorder-controls";
import { loadReorderOverview } from "@/lib/data/forecast";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  const { authed, rows } = await loadReorderOverview();

  if (!authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>수요예측·자동발주</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            로그인 후 자재별 수요예측과 재발주 알림을 확인하세요.
          </p>
          <Button asChild>
            <Link href="/login">로그인</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const alerts = rows.filter((r) => r.needsReorder);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">수요예측·자동발주</h1>
          <p className="text-sm text-muted-foreground">
            판매 이력 기반 예측으로 재발주 시점을 미리 알려드립니다.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/agent">자동 발주 에이전트 →</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>재발주 알림 ({alerts.length}건)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              등록된 자동발주 규칙이 없습니다. 아래에서 규칙을 추가하세요.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.productId} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      재고 {r.currentStock} · 발주점 {r.reorderPoint} · 예측 {r.predictedQty}/월
                    </p>
                  </div>
                  {r.needsReorder ? (
                    <Badge variant="warning">발주필요 {r.suggestedQty}</Badge>
                  ) : (
                    <Badge variant="success">충분</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          <ReorderDraftButton count={alerts.length} />
        </CardContent>
      </Card>

      <ReorderRuleForm />
    </div>
  );
}
