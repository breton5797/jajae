import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AgentPolicyForm,
  KillSwitch,
  RunAgentButton,
  DecisionActions,
  ReverseButton,
} from "@/components/agent-controls";
import { loadAgentConsole } from "@/lib/data/agent";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  auto_executed: "자동실행",
  escalated: "승인대기",
  approved: "승인됨",
  rejected: "반려됨",
  pending: "대기",
};

export default async function AgentPage() {
  const c = await loadAgentConsole();

  if (!c.authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>자동 발주 에이전트</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            로그인 후 자율 발주 정책을 설정하고 에이전트를 운영하세요.
          </p>
          <Button asChild>
            <Link href="/login">로그인</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">자동 발주 에이전트</h1>
        <p className="text-sm text-muted-foreground">
          정책 범위 내에서 AI가 자동 발주하고, 초과 건은 승인 대기로 올립니다. 모든 결정은
          기록·되돌리기 가능합니다.
        </p>
      </div>

      <KillSwitch enabled={Boolean(c.policy?.enabled)} />
      <AgentPolicyForm policy={c.policy} />
      <RunAgentButton disabled={!c.policy?.enabled} />

      <Card>
        <CardHeader>
          <CardTitle>승인 대기 ({c.queue.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {c.queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">대기 중인 결정이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {c.queue.map((d) => (
                <li key={d.id} className="rounded-lg border p-3">
                  <p className="text-sm">{d.rationale}</p>
                  <div className="mt-2">
                    <DecisionActions decisionId={d.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>최근 결정</CardTitle>
        </CardHeader>
        <CardContent>
          {c.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">결정 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y text-sm">
              {c.recent.slice(0, 10).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.rationale}</span>
                  <Badge variant={d.status === "rejected" ? "destructive" : d.status === "auto_executed" ? "success" : "neutral"}>
                    {STATUS[d.status] ?? d.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>자동 발주 (되돌리기 가능)</CardTitle>
        </CardHeader>
        <CardContent>
          {c.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">자동 발주 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y text-sm">
              {c.actions.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    PO {a.po_id?.slice(0, 8) ?? "-"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ~{a.reversible_until.slice(0, 10)}
                  </span>
                  <ReverseButton actionId={a.id} reversed={a.reversed} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
