/** 템플릿 면적/개수 기반 자재 수량 근사 (순수·결정론). */
import type { ApartmentTemplate, FinishCategory, RoomSlot } from "@/lib/types";

const CEILING_H = 2.4;

const isHabitable = (r: RoomSlot) => r.type !== "balcony" && r.type !== "bathroom";
const area = (r: RoomSlot) => r.w * r.h;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 마루 깔리는 면적: 욕실·발코니 제외 합(㎡). */
export function floorAreaM2(t: ApartmentTemplate): number {
  return round1(t.rooms.filter(isHabitable).reduce((s, r) => s + area(r), 0));
}

/** 벽지/도배/페인트 면적: 거주 방 둘레 × 천장고(㎡). */
export function wallAreaM2(t: ApartmentTemplate): number {
  const perim = t.rooms.filter(isHabitable).reduce((s, r) => s + 2 * (r.w + r.h), 0);
  return round1(perim * CEILING_H);
}

/** 몰딩/걸레받이 길이: 거주 방 둘레 합(m). */
export function perimeterM(t: ApartmentTemplate): number {
  return round1(t.rooms.filter(isHabitable).reduce((s, r) => s + 2 * (r.w + r.h), 0));
}

const balconyArea = (t: ApartmentTemplate) =>
  round1(t.rooms.filter((r) => r.type === "balcony").reduce((s, r) => s + area(r), 0));
const livingCount = (t: ApartmentTemplate) => t.rooms.filter((r) => r.type === "living").length;

export function approxQuantity(
  category: FinishCategory,
  t: ApartmentTemplate,
): { qty: number; unit: string } {
  switch (category) {
    case "flooring":
      return { qty: floorAreaM2(t), unit: "m2" };
    case "wallpaper":
    case "paint":
      return { qty: wallAreaM2(t), unit: "m2" };
    case "tile":
      // 욕실 벽+바닥 대표 12㎡/실 + 발코니 바닥
      return { qty: round1(t.bathrooms * 12 + balconyArea(t)), unit: "m2" };
    case "window":
      return { qty: t.bedrooms + livingCount(t), unit: "ea" };
    case "door":
      return { qty: t.bedrooms + t.bathrooms, unit: "ea" };
    case "kitchen":
      return { qty: 1, unit: "set" };
    case "sanitaryware":
      return { qty: t.bathrooms, unit: "set" };
    case "lighting":
      return { qty: t.rooms.filter(isHabitable).length, unit: "ea" };
    case "furniture":
      return { qty: t.bedrooms, unit: "ea" };
    case "molding":
      return { qty: perimeterM(t), unit: "m" };
    default: // film, board, engineered_stone — 1차 미산정
      return { qty: 0, unit: "ea" };
  }
}
