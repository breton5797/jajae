"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/store/cart";
import { fileToBase64 } from "@/lib/storage";
import { formatKRW } from "@/lib/utils";
import { UNIT_LABEL } from "@/lib/labels";
import type { ProductUnit, RoomArea, RoomType, SpecLevel } from "@/lib/types";

interface BomLineView {
  category: string;
  item: string;
  qty: number;
  unit: string;
  estUnitPrice: number;
  estPrice: number;
  productId?: string;
  supplierId?: string;
  matchedProductName?: string;
}
interface AnalysisView {
  rooms: RoomArea[];
  totalAreaM2: number;
  bom: { lines: BomLineView[]; estTotal: number; source: string };
  source: string;
}

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: "living", label: "거실" },
  { value: "room", label: "방" },
  { value: "bathroom", label: "욕실" },
  { value: "kitchen", label: "주방" },
  { value: "balcony", label: "발코니" },
  { value: "entrance", label: "현관" },
  { value: "other", label: "기타" },
];

const DEFAULT_ROOMS: RoomArea[] = [
  { name: "거실", type: "living", areaM2: 22 },
  { name: "안방", type: "room", areaM2: 14 },
  { name: "욕실", type: "bathroom", areaM2: 5 },
];

export default function DrawingPage() {
  const add = useCart((s) => s.add);
  const [specLevel, setSpecLevel] = useState<SpecLevel>("standard");
  const [rooms, setRooms] = useState<RoomArea[]>(DEFAULT_ROOMS);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setMimeType(file.type);
    setImageBase64(await fileToBase64(file));
  };

  const updateRoom = (i: number, patch: Partial<RoomArea>) =>
    setRooms((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRoom = () =>
    setRooms((rs) => [...rs, { name: "", type: "room", areaM2: 0 }]);
  const removeRoom = (i: number) =>
    setRooms((rs) => rs.filter((_, idx) => idx !== i));

  const analyze = async (useManual: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const body = useManual
        ? { rooms: rooms.filter((r) => r.name && r.areaM2 > 0), specLevel }
        : { imageBase64, mimeType, specLevel };
      const res = await fetch("/api/ai-quote/drawing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "분석에 실패했습니다.");
        setResult(null);
        return;
      }
      setResult(json as AnalysisView);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const addAll = () => {
    if (!result) return;
    for (const l of result.bom.lines) {
      if (!l.productId) continue;
      add({
        productId: l.productId,
        name: l.matchedProductName ?? l.item,
        brand: "",
        supplierId: l.supplierId ?? "",
        supplierName: "도면 견적",
        unitPrice: l.estUnitPrice,
        unit: l.unit as ProductUnit,
        qty: l.qty,
      });
    }
  };

  const matchedCount = result?.bom.lines.filter((l) => l.productId).length ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">도면 기반 AI 견적</h1>
        <p className="text-sm text-muted-foreground">
          평면도를 업로드하면 공간을 분석해 자재 물량(BOM)을 산출합니다. 키가 없거나
          인식이 어려우면 공간 정보를 직접 입력하세요.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. 평면도 업로드 (선택)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 text-sm text-muted-foreground hover:bg-muted">
            <Upload className="h-5 w-5" />
            {fileName ?? "PDF / PNG / JPG 선택"}
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              className="hidden"
              onChange={onFile}
            />
          </label>
          <div className="flex items-center gap-2">
            <Label className="text-sm">사양 등급</Label>
            <Select
              value={specLevel}
              onChange={(e) => setSpecLevel(e.target.value as SpecLevel)}
              className="w-40"
            >
              <option value="economy">실속형</option>
              <option value="standard">표준</option>
              <option value="premium">프리미엄</option>
            </Select>
          </div>
          <Button
            onClick={() => analyze(false)}
            disabled={loading || !imageBase64}
            className="w-full"
          >
            {loading ? "분석 중..." : "도면 분석하기"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. 공간 직접 입력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rooms.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={r.name}
                onChange={(e) => updateRoom(i, { name: e.target.value })}
                placeholder="공간명"
                className="flex-1"
              />
              <Select
                value={r.type}
                onChange={(e) => updateRoom(i, { type: e.target.value as RoomType })}
                className="w-24"
              >
                {ROOM_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                value={r.areaM2 || ""}
                onChange={(e) => updateRoom(i, { areaM2: Number(e.target.value) })}
                placeholder="㎡"
                className="w-20"
              />
              <Button variant="ghost" size="icon" onClick={() => removeRoom(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRoom}>
            <Plus className="h-4 w-4" /> 공간 추가
          </Button>
          <Button
            onClick={() => analyze(true)}
            disabled={loading}
            className="w-full"
          >
            {loading ? "산출 중..." : "입력 공간으로 BOM 산출"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-destructive">{error}</p>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>
              산출 결과 · 총 {result.totalAreaM2}㎡{" "}
              <Badge variant={result.source === "ai" ? "default" : "neutral"}>
                {result.source === "ai" ? "AI 도면분석" : "수동 입력"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1">카테고리</th>
                    <th>품목</th>
                    <th className="text-right">수량</th>
                    <th className="text-right">예상금액</th>
                  </tr>
                </thead>
                <tbody>
                  {result.bom.lines.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5">{l.category}</td>
                      <td>{l.matchedProductName ?? l.item}</td>
                      <td className="text-right">
                        {l.qty} {UNIT_LABEL[l.unit] ?? l.unit}
                      </td>
                      <td className="text-right">{formatKRW(l.estPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm text-muted-foreground">
                매칭 {matchedCount}개 품목
              </span>
              <span className="font-bold">
                총 {formatKRW(result.bom.estTotal)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button onClick={addAll} disabled={matchedCount === 0} className="flex-1">
                매칭 자재 장바구니 담기
              </Button>
              <Button variant="outline" asChild>
                <Link href="/cart">장바구니</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
