import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsSnapshotButton } from "@/components/analytics-snapshot-button";
import { loadLiveAnalytics } from "@/lib/data/analytics";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function AdminAnalyticsPage() {
  const period = new Date().toISOString().slice(0, 7);
  const a = await loadLiveAnalytics(period);
  const maxPerf = Math.max(1, ...a.supplierPerf.map((s) => s.value));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground hover:text-brand">
            ← 운영 콘솔
          </Link>
          <h1 className="text-xl font-bold">오너 애널리틱스</h1>
          <p className="text-sm text-muted-foreground">{period} 기준 실시간 지표</p>
        </div>
        <AnalyticsSnapshotButton period={period} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="GMV" value={formatKRW(a.gmv)} />
        <Metric label="마진(수수료+PB)" value={formatKRW(a.margin)} />
        <Metric label="PB 비중" value={`${Math.round(a.pbShare * 100)}%`} />
        <Metric label="재구매율" value={`${Math.round(a.repeatRate * 100)}%`} />
        <Metric label="예측 정확도" value={`${Math.round(a.forecastAccuracy * 100)}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>공급사 성과 (거래액)</CardTitle>
        </CardHeader>
        <CardContent>
          {a.supplierPerf.length === 0 ? (
            <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {a.supplierPerf.slice(0, 8).map((s) => (
                <li key={s.supplierId} className="text-sm">
                  <div className="mb-0.5 flex justify-between">
                    <span className="font-mono text-xs text-muted-foreground">
                      {s.supplierId.slice(0, 8)}
                    </span>
                    <span>{formatKRW(s.value)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.round((s.value / maxPerf) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
