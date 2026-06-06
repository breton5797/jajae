import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BudgetBar } from "@/components/budget-bar";
import { SiteTaskManager } from "@/components/site-task-manager";
import { loadSiteWorkspace } from "@/lib/data/projects";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SiteWorkspacePage({
  params,
}: {
  params: { siteId: string };
}) {
  const ws = await loadSiteWorkspace(params.siteId);

  if (!ws.authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>현장 워크스페이스</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>
          <Button asChild>
            <Link href="/login">로그인</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!ws.site) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">현장을 찾을 수 없습니다.</p>
          <Button variant="outline" asChild>
            <Link href="/sites">현장 목록</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/sites" className="text-sm text-muted-foreground hover:text-brand">
          ← 현장 목록
        </Link>
        <h1 className="text-xl font-bold">{ws.site.name}</h1>
        {ws.site.address && (
          <p className="text-sm text-muted-foreground">{ws.site.address}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>예산 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetBar budget={ws.budget} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>주문 타임라인</CardTitle>
        </CardHeader>
        <CardContent>
          {ws.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">현장에 연결된 주문이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {ws.timeline.map((pt) => (
                <li
                  key={pt.orderId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{pt.date}</span>
                  <span className="font-mono text-xs">{pt.orderId.slice(0, 8)}</span>
                  <span>{formatKRW(pt.amount)}</span>
                  <Badge variant="neutral">누적 {formatKRW(pt.cumulative)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            일정 · 문서{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {ws.schedule.done}/{ws.schedule.total} 완료
              {ws.schedule.nextTask && ` · 다음: ${ws.schedule.nextTask.title}`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SiteTaskManager
            siteId={ws.site.id}
            tasks={ws.tasks}
            documents={ws.documents}
          />
        </CardContent>
      </Card>
    </div>
  );
}
