"use client";

import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { useCart, type CartLine } from "@/lib/store/cart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { formatKRW } from "@/lib/utils";
import { UNIT_LABEL } from "@/lib/labels";

const FEE_RATE = 0.03;

interface SupplierGroup {
  name: string;
  items: CartLine[];
}

function groupBySupplier(lines: CartLine[]): Map<string, SupplierGroup> {
  const groups = new Map<string, SupplierGroup>();
  for (const line of lines) {
    const existing = groups.get(line.supplierId);
    if (existing) {
      groups.set(line.supplierId, {
        name: existing.name,
        items: [...existing.items, line],
      });
    } else {
      groups.set(line.supplierId, {
        name: line.supplierName,
        items: [line],
      });
    }
  }
  return groups;
}

export default function CartPage() {
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);

  if (lines.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand">
              <ShoppingCart className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                장바구니가 비어 있습니다
              </p>
              <p className="text-sm text-muted-foreground">
                필요한 자재를 담아 견적을 받아보세요.
              </p>
            </div>
            <Button asChild>
              <Link href="/catalog">자재 둘러보기</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const groups = groupBySupplier(lines);
  const sum = lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0);
  const fee = Math.round(sum * FEE_RATE);
  const total = sum + fee;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-xl font-bold text-foreground">장바구니</h1>

      {Array.from(groups.entries()).map(([supplierId, group]) => {
        const groupSubtotal = group.items.reduce(
          (acc, l) => acc + l.unitPrice * l.qty,
          0,
        );
        return (
          <Card key={supplierId}>
            <CardHeader>
              <CardTitle className="text-base">{group.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.items.map((item) => {
                const unitText = UNIT_LABEL[item.unit] ?? item.unit;
                return (
                  <div
                    key={item.productId}
                    className="flex flex-col gap-3 rounded-lg border border-input p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {item.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatKRW(item.unitPrice)} / {unitText}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="수량 감소"
                          onClick={() => setQty(item.productId, item.qty - 1)}
                          disabled={item.qty <= 1}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-10 text-center text-sm font-medium tabular-nums">
                          {item.qty}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="수량 증가"
                          onClick={() => setQty(item.productId, item.qty + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <span className="w-24 text-right text-sm font-semibold tabular-nums">
                        {formatKRW(item.unitPrice * item.qty)}
                      </span>

                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="삭제"
                        onClick={() => remove(item.productId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
            <CardFooter className="justify-end">
              <p className="text-sm text-muted-foreground">
                공급사 소계{" "}
                <span className="font-semibold text-foreground">
                  {formatKRW(groupSubtotal)}
                </span>
              </p>
            </CardFooter>
          </Card>
        );
      })}

      <Card>
        <CardContent className="space-y-2 py-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">상품합계</span>
            <span className="font-medium tabular-nums">{formatKRW(sum)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">플랫폼 수수료 (3%)</span>
            <span className="font-medium tabular-nums">{formatKRW(fee)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-input pt-3 text-base">
            <span className="font-semibold text-foreground">총 결제금액</span>
            <span className="font-bold text-brand-700 tabular-nums">
              {formatKRW(total)}
            </span>
          </div>
        </CardContent>
        <CardFooter>
          <Button asChild size="lg" className="w-full">
            <Link href="/checkout">주문하기</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
