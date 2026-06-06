export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  loadCategoryTree,
  loadProducts,
  loadSupplierRatingMap,
} from "@/lib/data/catalog";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: { category?: string; q?: string };
}) {
  const tree = await loadCategoryTree();
  const products = await loadProducts({
    categoryId: searchParams.category,
    q: searchParams.q,
  });
  const ratingMap = await loadSupplierRatingMap();

  const activeCategory = searchParams.category;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold">자재 카탈로그</h1>

      {/* 검색 */}
      <form method="get" action="/catalog" className="flex gap-2">
        <Input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="자재명·브랜드 검색"
          className="flex-1"
        />
        <Button type="submit" size="sm">
          검색
        </Button>
      </form>

      {/* 카테고리 네비게이션 */}
      <nav className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <CategoryChip href="/catalog" label="전체" active={!activeCategory} />
          {tree.map((node) => (
            <CategoryChip
              key={node.id}
              href={`/catalog?category=${node.id}`}
              label={node.name}
              active={activeCategory === node.id}
            />
          ))}
        </div>
        {tree.map((node) =>
          node.children.length > 0 ? (
            <div key={node.id} className="flex flex-wrap gap-2 pl-1">
              {node.children.map((child) => (
                <CategoryChip
                  key={child.id}
                  href={`/catalog?category=${child.id}`}
                  label={child.name}
                  active={activeCategory === child.id}
                  small
                />
              ))}
            </div>
          ) : null
        )}
      </nav>

      {/* 상품 그리드 */}
      {products.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-gray-500">
            표시할 상품이 없습니다. Supabase 연결 및 시드 후 표시됩니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              supplierRating={ratingMap.get(p.supplier_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  href,
  label,
  active,
  small,
}: {
  href: string;
  label: string;
  active: boolean;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-3 py-1 text-sm transition-colors",
        small && "text-xs",
        active
          ? "border-brand bg-brand-50 text-brand-700"
          : "border-gray-200 text-gray-700 hover:bg-brand-50"
      )}
    >
      {label}
    </Link>
  );
}
