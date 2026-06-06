import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KakaoRouteMap } from "@/components/kakao-route-map";
import { BatchButton, RunStatusSelect } from "@/components/logistics-controls";
import { loadOpenPosForBatching, loadDeliveryRuns } from "@/lib/data/logistics";
import type { RunStop } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  planned: "계획",
  confirmed: "확정",
  dispatched: "배차/출발",
  completed: "완료",
};

export default async function AdminLogisticsPage() {
  const [openPos, runs] = await Promise.all([
    loadOpenPosForBatching(),
    loadDeliveryRuns(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-brand">
          ← 운영 콘솔
        </Link>
        <h1 className="text-xl font-bold">배송 배차 (물류 최적화)</h1>
        <p className="text-sm text-muted-foreground">
          지역·날짜가 같은 발주(PO)를 묶어 배송 트립을 최소화합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>배차 대기 PO: {openPos.length}건</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchButton />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {runs.length === 0 && (
          <p className="text-sm text-muted-foreground">생성된 배차가 없습니다.</p>
        )}
        {runs.map((run) => {
          const stops =
            run.route && "stops" in run.route ? (run.route.stops as RunStop[]) : [];
          return (
            <Card key={run.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>
                    {run.region} · {run.run_date}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={run.status === "completed" ? "success" : "neutral"}>
                      {STATUS_LABEL[run.status] ?? run.status}
                    </Badge>
                    <RunStatusSelect runId={run.id} status={run.status} />
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <KakaoRouteMap stops={stops} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
