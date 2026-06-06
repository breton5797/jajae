"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatKRW } from "@/lib/utils";
import { UNIT_LABEL } from "@/lib/labels";
import { useCart } from "@/lib/store/cart";

type QuoteLine = {
  category: string;
  categorySlug: string;
  item: string;
  qty: number;
  unit: string;
  estUnitPrice: number;
  estPrice: number;
  productId?: string;
  supplierId?: string;
  matchedProductName?: string;
};

type QuoteResult = {
  lines: QuoteLine[];
  estTotal: number;
  source: "ai" | "fallback";
};

const PROJECT_TYPES = [
  { value: "apartment_remodel", label: "아파트 리모델링" },
  { value: "bathroom", label: "욕실" },
  { value: "kitchen", label: "주방" },
  { value: "commercial_interior", label: "상업공간" },
  { value: "new_build", label: "신축" },
] as const;

const SPEC_LEVELS = [
  { value: "economy", label: "실속형" },
  { value: "standard", label: "표준" },
  { value: "premium", label: "프리미엄" },
] as const;

export default function AiQuotePage() {
  const [projectType, setProjectType] = useState<string>("apartment_remodel");
  const [areaPyeong, setAreaPyeong] = useState<string>("24");
  const [bathroomCount, setBathroomCount] = useState<string>("2");
  const [specLevel, setSpecLevel] = useState<string>("standard");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuoteResult | null>(null);

  const addToCart = useCart((s) => s.add);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectType,
          areaPyeong: Number(areaPyeong),
          dimensions: { bathroomCount: Number(bathroomCount) },
          specLevel,
        }),
      });
      if (!res.ok) throw new Error("견적 생성에 실패했습니다");
      const data: QuoteResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  function handleAddAll() {
    if (!result) return;
    for (const line of result.lines) {
      if (!line.productId) continue;
      addToCart({
        productId: line.productId,
        name: line.matchedProductName ?? line.item,
        brand: "",
        supplierId: line.supplierId ?? "",
        supplierName: "AI 매칭",
        unitPrice: line.estUnitPrice,
        unit: line.unit as never,
        qty: line.qty,
      });
    }
  }

  const hasMatched = result?.lines.some((l) => l.productId) ?? false;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-brand-700">AI 자재 물량산출 (BOM)</h1>
        <p className="text-sm text-gray-500">
          프로젝트 정보를 입력하면 필요한 자재 물량과 예상 견적을 추정합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>견적 조건</CardTitle>
          <CardDescription>현장 규모와 사양 수준을 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="projectType">공사 유형</Label>
            <Select
              id="projectType"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            >
              {PROJECT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="specLevel">사양 수준</Label>
            <Select
              id="specLevel"
              value={specLevel}
              onChange={(e) => setSpecLevel(e.target.value)}
            >
              {SPEC_LEVELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="areaPyeong">면적 (평)</Label>
            <Input
              id="areaPyeong"
              type="number"
              min={1}
              value={areaPyeong}
              onChange={(e) => setAreaPyeong(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bathroomCount">욕실 수</Label>
            <Input
              id="bathroomCount"
              type="number"
              min={0}
              value={bathroomCount}
              onChange={(e) => setBathroomCount(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-2">
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "생성 중..." : "AI 견적 생성"}
          </Button>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardFooter>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>예상 자재 내역</CardTitle>
            <CardDescription>
              총 {result.lines.length}개 품목
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-3 font-medium">카테고리</th>
                  <th className="py-2 pr-3 font-medium">품목</th>
                  <th className="py-2 pr-3 font-medium text-right">수량</th>
                  <th className="py-2 pr-3 font-medium text-right">예상단가</th>
                  <th className="py-2 font-medium text-right">예상금액</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line, i) => (
                  <tr key={`${line.categorySlug}-${i}`} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-gray-600">{line.category}</td>
                    <td className="py-2 pr-3">{line.matchedProductName ?? line.item}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {line.qty} {UNIT_LABEL[line.unit] ?? line.unit}
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {formatKRW(line.estUnitPrice)}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {formatKRW(line.estPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-3">
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium text-gray-600">총 예상금액</span>
              <span className="text-lg font-bold text-brand-700">
                {formatKRW(result.estTotal)}
              </span>
            </div>
            {result.source === "fallback" ? (
              <p className="text-xs text-gray-400">샘플 단가 기준 추정치입니다</p>
            ) : null}
            <Button onClick={handleAddAll} disabled={!hasMatched} variant="outline">
              매칭된 자재 전체 장바구니 담기
            </Button>
            <Button asChild>
              <Link href="/cart">장바구니로 이동</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}
