export const dynamic = "force-dynamic";

import Link from "next/link";
import { loadProduct } from "@/lib/data/catalog";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { UNIT_LABEL } from "@/lib/labels";
import { formatKRW } from "@/lib/utils";

export default async function ProductPage({
  params,
}: {
  params: { productId: string };
}) {
  const product = await loadProduct(params.productId);

  if (!product) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>상품을 찾을 수 없습니다</CardTitle>
            <CardDescription>
              요청하신 상품이 삭제되었거나 존재하지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline" size="sm">
              <Link href="/catalog">카탈로그로 돌아가기</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const unitLabel = UNIT_LABEL[product.unit] ?? product.unit;
  const inStock = product.stock > 0;
  const specRows = Object.entries(product.spec);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* breadcrumb */}
      <nav className="mb-4 text-sm text-neutral-500">
        <Link href="/catalog" className="hover:text-brand-700">
          카탈로그
        </Link>
        <span className="mx-2 text-neutral-300">/</span>
        <span className="text-neutral-700">{product.name}</span>
      </nav>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={inStock ? "success" : "destructive"}>
              {inStock ? `재고 ${product.stock}` : "품절"}
            </Badge>
            <Badge variant="outline">리드타임 {product.lead_time_days}일</Badge>
          </div>
          <CardTitle className="text-2xl">{product.name}</CardTitle>
          <CardDescription className="text-sm text-neutral-500">
            {product.brand}
          </CardDescription>
          <p className="text-3xl font-bold text-brand-700">
            {formatKRW(product.unit_price)}
            <span className="ml-1 text-base font-normal text-neutral-500">
              / {unitLabel}
            </span>
          </p>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* spec table */}
          {specRows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-neutral-200">
              <table className="w-full text-sm">
                <tbody>
                  {specRows.map(([key, value]) => (
                    <tr
                      key={key}
                      className="border-b border-neutral-100 last:border-0"
                    >
                      <th className="w-1/3 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600">
                        {key}
                      </th>
                      <td className="px-3 py-2 text-neutral-800">
                        {String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-neutral-400">사양 정보가 없습니다.</p>
          )}

          {product.spec_sheet_url ? (
            <Link
              href={product.spec_sheet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-700 hover:text-brand-600"
            >
              사양서 보기 →
            </Link>
          ) : null}
        </CardContent>

        <CardFooter>
          <AddToCartButton product={product} className="w-full sm:w-auto" />
        </CardFooter>
      </Card>
    </div>
  );
}
