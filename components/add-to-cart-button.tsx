"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/store/cart";
import type { Product } from "@/lib/types";

export function AddToCartButton({
  product,
  supplierName = "공급사",
  qty = 1,
  className,
}: {
  product: Product;
  supplierName?: string;
  qty?: number;
  className?: string;
}) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);

  const onAdd = () => {
    add({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      supplierId: product.supplier_id,
      supplierName,
      unitPrice: product.unit_price,
      unit: product.unit,
      qty,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <Button
      type="button"
      onClick={onAdd}
      disabled={product.stock <= 0}
      className={className}
      variant={added ? "secondary" : "default"}
    >
      {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {added ? "담김" : "장바구니"}
    </Button>
  );
}
