import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FinanceRequestForm } from "@/components/finance-request-form";
import { loadFinancingOverview } from "@/lib/data/financing";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

const REQ_STATUS: Record<string, string> = {
  requested: "신청됨",
  approved: "승인",
  disbursed: "지급완료",
  repaying: "상환중",
  settled: "상환완료",
  overdue: "연체",
  rejected: "반려",
};

export default async function FinancingPage() {
  const f = await loadFinancingOverview();

  if (!f.authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>임베디드 금융</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            로그인 후 신용점수, 선정산(조기지급), 구매 파이낸싱을 이용하세요.
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
      <h1 className="text-xl font-bold">임베디드 금융 (선정산·여신)</h1>

      <Card>
        <CardHeader>
          <CardTitle>내 신용점수</CardTitle>
        </CardHeader>
        <CardContent>
          {!f.score ? (
            <p className="text-sm text-muted-foreground">
              아직 신용점수가 산출되지 않았습니다. 거래가 쌓이면 자동 산출됩니다.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-brand">{f.score.score}</span>
                <Badge variant="default">{f.score.grade}</Badge>
                {f.offer?.eligible && (
                  <span className="ml-auto text-sm text-muted-foreground">
                    한도 {formatKRW(f.offer.limit)} · 금리 {(f.offer.rate * 100).toFixed(1)}%
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-sm">
                {f.score.factors.map((fa) => (
                  <li key={fa.key} className="flex justify-between">
                    <span className="text-muted-foreground">{fa.label}</span>
                    <span className="font-medium">+{fa.contribution}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>금융 신청</CardTitle>
        </CardHeader>
        <CardContent>
          <FinanceRequestForm eligible={Boolean(f.offer?.eligible)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>신청 내역</CardTitle>
        </CardHeader>
        <CardContent>
          {f.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">금융 신청 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {f.requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{r.type === "early_settlement" ? "선정산" : "구매금융"}</span>
                  <span>{formatKRW(r.amount)}</span>
                  <Badge variant={r.status === "settled" ? "success" : r.status === "overdue" ? "destructive" : "neutral"}>
                    {REQ_STATUS[r.status] ?? r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
