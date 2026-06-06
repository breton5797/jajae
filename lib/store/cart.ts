"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProductUnit } from "@/lib/types";

export interface CartLine {
  productId: string;
  name: string;
  brand: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  unit: ProductUnit;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  add: (line: CartLine) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  subtotal: () => number;
  count: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (line) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === line.productId);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.productId === line.productId
                  ? { ...l, qty: l.qty + line.qty }
                  : l,
              ),
            };
          }
          return { lines: [...s.lines, line] };
        }),
      setQty: (productId, qty) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.productId === productId ? { ...l, qty: Math.max(1, qty) } : l,
          ),
        })),
      remove: (productId) =>
        set((s) => ({
          lines: s.lines.filter((l) => l.productId !== productId),
        })),
      clear: () => set({ lines: [] }),
      subtotal: () =>
        get().lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
      count: () => get().lines.reduce((sum, l) => sum + l.qty, 0),
    }),
    { name: "jajae-cart" },
  ),
);
