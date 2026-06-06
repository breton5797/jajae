import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PriceTrendChart } from "@/components/price-trend-chart";
import {
  loadComparableCategories,
  loadPriceComparison,
  loadPriceTrend,
} from "@/lib/data/pricing";
import { formatKRW, cn } from "@/lib/utils";
import { UNIT_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function PriceIntelligencePage({
  searchParams,
}: {
  searchParams: { category?: string; product?: string };
}) {
  const categories = await loadComparableCategories();
  const categoryId = searchParams.category ?? categories[0]?.id;
  const comparison = categoryId ? await loadPriceComparison(categoryId) : null;
  const trend = searchParams.product
    ? await loadPriceTrend(searchParams.product)
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">가격 인텔리전스</h1>
        <p className="text-sm text-muted-foreground">
          동일 사양 자재의 공급사별 가격을 비교하고, 과거 가격 추이를 확인하세요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/price-intelligence?category=${c.id}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              c.id === categoryId
                ? "border-brand bg-brand-50 text-brand-700"
                : "hover:bg-muted",
            )}
          >
            {c.name}
          </Link>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            카테고리를 불러올 수 없습니다. (Supabase 연결 필요)
          </p>
        )}
      </div>

      {comparison && comparison.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              공급사별 가격 비교{" "}
              <span className="text-sm font-normal text-muted-foreground">
                최저 {formatKRW(comparison.min)} · 중간 {formatKRW(comparison.median)} ·
                최고 {formatKRW(comparison.max)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1">상품</th>
                  <th className="text-right">단가</th>
                  <th className="text-right">절감</th>
                  <th className="text-right">추이</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((r) => (
                  <tr key={r.productId} className="border-t">
                    <td className="py-2">
                      <div className="font-medium">{r.productName}</div>
                      <div className="text-xs text-muted-foreground">{r.brand}</div>
                    </td>
                    <td className="text-right">
                      {formatKRW(r.unitPrice)}
                      {r.isLowest && (
                        <Badge variant="success" className="ml-1">
                          최저가
                        </Badge>
                      )}
                    </td>
                    <td className="text-right text-xs text-muted-foreground">
                      {r.savingsVsMax > 0 ? `-${formatKRW(r.savingsVsMax)}` : "-"}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/price-intelligence?category=${categoryId}&product=${r.productId}`}
                        className="text-brand hover:underline"
                      >
                        보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {searchParams.product && (
        <Card>
          <CardHeader>
            <CardTitle>가격 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <PriceTrendChart points={trend} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
