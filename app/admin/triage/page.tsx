import Link from "next/link";
import { loadTriageConsole } from "@/lib/data/triage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatKRW } from "@/lib/utils";
import { RunTriageButton, TriagePolicyForm, TriageRowActions } from "@/components/triage-controls";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  const c = await loadTriageConsole();

  if (!c.authed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <p className="text-sm text-gray-500">관리자 권한이 필요합니다.</p>
        <Link href="/login" className="text-brand">로그인</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-brand">
          ← 운영 콘솔
        </Link>
        <h1 className="text-xl font-bold">반품 트리아지</h1>
        <p className="text-sm text-muted-foreground">
          분류기 제안 → 정책 범위 내 자동 승인 · 나머지는 사람 검토
        </p>
      </div>

      <TriagePolicyForm policy={c.policy} />
      <RunTriageButton />

      <Card>
        <CardHeader>
          <CardTitle>대기 반품 ({c.queue.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {c.queue.length === 0 ? (
            <p className="text-sm text-gray-400">대기 중인 반품이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {c.queue.map((r) => (
                <li key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.productName || "상품"}</p>
                      <p className="truncate text-sm text-gray-500">{r.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        수량 {r.qty} · 환불 {formatKRW(r.refundAmount)}
                      </p>
                      {r.lastDecision && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          최근 분류: {r.lastDecision} — {r.lastRationale}
                        </p>
                      )}
                    </div>
                    <Badge variant="neutral">{r.lastDecision ?? "미처리"}</Badge>
                  </div>
                  <div className="mt-2">
                    <TriageRowActions returnId={r.id} />
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
