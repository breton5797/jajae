import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadGroupBuys } from "@/lib/data/groupbuy";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "진행중",
  closed: "마감",
  cancelled: "취소",
};

export default async function GroupBuyListPage() {
  const campaigns = await loadGroupBuys();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">공동구매</h1>
        <p className="text-sm text-muted-foreground">
          여러 시공사가 모이면 가격이 내려갑니다. 수량이 쌓일수록 단가가 자동으로 하락합니다.
        </p>
      </div>

      {campaigns.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            진행 중인 공동구매가 없습니다.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {campaigns.map((c) => (
          <Link key={c.id} href={`/group-buy/${c.id}`}>
            <Card className="transition-colors hover:border-brand">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{c.title}</span>
                  <Badge variant={c.status === "open" ? "success" : "neutral"}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  누적 {c.joined_qty}개 · 목표 {c.min_qty}개
                </span>
                <span className="font-bold text-brand">
                  현재가 {formatKRW(c.currentPrice)}
                  {c.basePrice > c.currentPrice && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground line-through">
                      {formatKRW(c.basePrice)}
                    </span>
                  )}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
