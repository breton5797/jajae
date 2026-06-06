import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GroupBuyJoin } from "@/components/group-buy-join";
import { loadGroupBuy } from "@/lib/data/groupbuy";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GroupBuyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { groupBuy, myJoin, joinCount } = await loadGroupBuy(params.id);

  if (!groupBuy) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">캠페인을 찾을 수 없습니다.</p>
          <Button variant="outline" asChild>
            <Link href="/group-buy">공동구매 목록</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const progress = Math.min(
    100,
    Math.round((groupBuy.joined_qty / groupBuy.min_qty) * 100),
  );

  return (
    <div className="space-y-4">
      <Link href="/group-buy" className="text-sm text-muted-foreground hover:text-brand">
        ← 공동구매 목록
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            {groupBuy.title}
            <Badge variant={groupBuy.status === "open" ? "success" : "neutral"}>
              {groupBuy.status === "open" ? "진행중" : groupBuy.status === "closed" ? "마감" : "취소"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-brand">
                {formatKRW(groupBuy.currentPrice)}
              </span>
              {groupBuy.basePrice > groupBuy.currentPrice && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatKRW(groupBuy.basePrice)}
                </span>
              )}
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              누적 {groupBuy.joined_qty}개 / 목표 {groupBuy.min_qty}개 · 참여 {joinCount}명
            </p>
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold">수량별 가격</p>
            <ul className="space-y-1 text-sm">
              {groupBuy.tiers.map((t, i) => {
                const active = groupBuy.joined_qty >= t.minQty;
                return (
                  <li
                    key={i}
                    className={active ? "font-semibold text-brand" : "text-muted-foreground"}
                  >
                    {t.minQty}개 이상 → {formatKRW(t.unitPrice)} {active && "✓"}
                  </li>
                );
              })}
            </ul>
          </div>

          <GroupBuyJoin
            groupBuyId={groupBuy.id}
            initialQty={myJoin?.qty ?? 0}
            closed={groupBuy.status !== "open"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
