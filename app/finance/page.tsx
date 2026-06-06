import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadFinanceOverview } from "@/lib/data/finance";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STMT_LABEL: Record<string, string> = {
  draft: "작성중",
  issued: "발행",
  paid: "결제완료",
  disputed: "이의",
};
const INV_LABEL: Record<string, string> = {
  pending: "발행대기",
  issued: "발행완료",
  failed: "발행실패",
};

export default async function FinancePage() {
  const f = await loadFinanceOverview();

  if (!f.authed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>정산·여신</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            로그인 후 월별 정산서, 전자세금계산서, 여신 현황을 확인할 수 있습니다.
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
      <h1 className="text-xl font-bold">정산·여신</h1>

      <Card>
        <CardHeader>
          <CardTitle>여신(외상) 현황</CardTitle>
        </CardHeader>
        <CardContent>
          {!f.credit ? (
            <p className="text-sm text-muted-foreground">개설된 여신 계좌가 없습니다.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">여신 한도</span>
                <span className="font-semibold">{formatKRW(f.credit.limit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">사용액</span>
                <span>{formatKRW(f.credit.used)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">잔여 한도</span>
                <span className="font-semibold">{formatKRW(f.credit.available)}</span>
              </div>
              {f.credit.overdue > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>연체 금액</span>
                  <span className="font-semibold">{formatKRW(f.credit.overdue)}</span>
                </div>
              )}
              {f.credit.blocked && f.credit.reason && (
                <p className="rounded-md bg-red-50 p-2 text-xs text-destructive">
                  {f.credit.reason}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>월별 정산서</CardTitle>
        </CardHeader>
        <CardContent>
          {f.settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">정산 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {f.settlements.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{s.period}</span>
                  <span>{formatKRW(s.net)}</span>
                  <Badge variant={s.status === "paid" ? "success" : "neutral"}>
                    {STMT_LABEL[s.status] ?? s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>전자세금계산서</CardTitle>
        </CardHeader>
        <CardContent>
          {f.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">발행된 세금계산서가 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {f.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono text-xs">
                    {inv.provider_invoice_id ?? "-"}
                  </span>
                  <Badge
                    variant={
                      inv.status === "issued"
                        ? "success"
                        : inv.status === "failed"
                          ? "destructive"
                          : "neutral"
                    }
                  >
                    {INV_LABEL[inv.status] ?? inv.status}
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
