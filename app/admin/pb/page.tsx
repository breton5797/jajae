import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PbCreateForm } from "@/components/pb-create-form";
import { loadPbCandidates } from "@/lib/data/pb";
import { formatKRW } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminPbPage() {
  const candidates = await loadPbCandidates();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-brand">
          ← 운영 콘솔
        </Link>
        <h1 className="text-xl font-bold">PB 상품 추천 리포트</h1>
        <p className="text-sm text-muted-foreground">
          주문 데이터(수요×마진 잠재력)를 분석해 PB(자체브랜드) 후보 카테고리를 순위화합니다.
        </p>
      </div>

      {candidates.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            분석할 주문 데이터가 없습니다. (주문이 쌓이면 추천이 생성됩니다)
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <Card key={c.categoryId}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>
                    <Badge className="mr-2">#{c.rank}</Badge>
                    {c.categoryName}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    예상 마진 {formatKRW(c.score)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <p className="text-muted-foreground">누적 수량</p>
                    <p className="font-semibold">{c.totalQty}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">주문 건수</p>
                    <p className="font-semibold">{c.orderCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">예상 마진율</p>
                    <p className="font-semibold">{Math.round(c.estMarginRate * 100)}%</p>
                  </div>
                </div>
                <PbCreateForm categoryId={c.categoryId} categoryName={c.categoryName} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
