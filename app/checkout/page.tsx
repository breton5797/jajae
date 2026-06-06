"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { formatKRW } from "@/lib/utils";
import { useCart } from "@/lib/store/cart";

const FEE_RATE = 0.03;

type PaymentMethod = "escrow" | "credit";

type CheckoutResult = {
  orderId: string;
  poCount: number;
  total: number;
  hasBackorder: boolean;
  stages: number;
};

export default function CheckoutPage() {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);

  const [siteName, setSiteName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("escrow");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
    [lines]
  );
  const fee = Math.round(subtotal * FEE_RATE);
  const total = subtotal + fee;

  const supplierCount = useMemo(
    () => new Set(lines.map((l) => l.supplierId)).size,
    [lines]
  );

  async function handleCheckout() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: null,
          paymentMethod,
          tossPaymentKey: "test_" + Date.now(),
          lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })),
        }),
      });
      const data = (await res.json()) as Partial<CheckoutResult> & {
        error?: string;
      };
      if (!res.ok || data.error || typeof data.orderId !== "string") {
        setError(data.error ?? "결제에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setResult({
        orderId: data.orderId,
        poCount: data.poCount ?? 0,
        total: data.total ?? total,
        hasBackorder: data.hasBackorder ?? false,
        stages: data.stages ?? 0,
      });
      clear();
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-700">주문이 완료되었습니다</CardTitle>
            <CardDescription>주문번호 {result.orderId}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">결제 금액</span>
              <span className="font-semibold">{formatKRW(result.total)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">분할 주문</span>
              <span>공급사 {result.poCount}곳으로 분할</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">배송</span>
              <span>{result.stages}단계</span>
            </div>
            {result.hasBackorder ? (
              <div>
                <Badge variant="warning">일부 품목 백오더</Badge>
              </div>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full">
              <Link href="/dashboard">대시보드로 이동</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>장바구니가 비어 있습니다</CardTitle>
            <CardDescription>결제할 상품을 먼저 담아 주세요.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href="/catalog">상품 둘러보기</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-4 text-lg font-semibold">결제</h1>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">주문 요약</CardTitle>
          <CardDescription>
            공급사 {supplierCount}곳으로 분할 주문됩니다
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {lines.map((l) => (
            <div key={l.productId} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                {l.name}
                <span className="text-gray-400"> · {l.qty}</span>
              </span>
              <span className="shrink-0">{formatKRW(l.unitPrice * l.qty)}</span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t pt-3 text-gray-500">
            <span>상품 합계</span>
            <span>{formatKRW(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-500">
            <span>플랫폼 수수료 (3%)</span>
            <span>{formatKRW(fee)}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold">
            <span>총 결제 금액</span>
            <span className="text-brand-700">{formatKRW(total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="siteName">현장명</Label>
            <Input
              id="siteName"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="예: 반포자이 84동 1203호"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="paymentMethod">결제 수단</Label>
            <Select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="escrow">에스크로 결제</option>
              <option value="credit">외상/여신 결제</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <Button className="w-full" onClick={handleCheckout} disabled={submitting}>
        {submitting ? "결제 처리 중..." : `${formatKRW(total)} 결제하기`}
      </Button>
    </div>
  );
}
