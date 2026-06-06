import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { formatKRW } from "@/lib/utils";
import { UNIT_LABEL } from "@/lib/labels";
import type { Product } from "@/lib/types";

export function ProductCard({
  product,
  supplierName,
}: {
  product: Product;
  supplierName?: string;
}) {
  const unit = UNIT_LABEL[product.unit] ?? product.unit;
  const low = product.stock > 0 && product.stock <= 30;
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/catalog/${product.id}`}
            className="line-clamp-2 text-sm font-semibold hover:text-brand"
          >
            {product.name}
          </Link>
          {product.stock <= 0 ? (
            <Badge variant="destructive">품절</Badge>
          ) : low ? (
            <Badge variant="warning">잔여 {product.stock}</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{product.brand}</p>
        <div className="mt-auto">
          <p className="text-base font-bold">
            {formatKRW(product.unit_price)}
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">
              / {unit}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            리드타임 {product.lead_time_days}일
          </p>
        </div>
        <AddToCartButton
          product={product}
          supplierName={supplierName}
          className="h-9 w-full text-xs"
        />
      </CardContent>
    </Card>
  );
}
