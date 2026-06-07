import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAgentOps } from "@/lib/data/agent";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function AgentOpsPage() {
  const s = await loadAgentOps();
  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-brand">
          ← 운영 콘솔
        </Link>
        <h1 className="text-xl font-bold">에이전트 운영 현황</h1>
        <p className="text-sm text-muted-foreground">자율 발주 볼륨 · 에스컬레이션 · 개입</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="자동 발주 건수" value={`${s.autoPoCount}건`} />
        <Metric label="자동 발주 금액" value={formatKRW(s.autoPoValue)} />
        <Metric label="에스컬레이션" value={`${s.escalations}건`} />
        <Metric label="에스컬레이션 비율" value={`${Math.round(s.escalationRate * 100)}%`} />
        <Metric label="사람 개입" value={`${s.interventions}건`} />
      </div>
    </div>
  );
}
