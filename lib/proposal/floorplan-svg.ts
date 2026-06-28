// lib/proposal/floorplan-svg.ts
/** ApartmentTemplate → 라벨/면적 주석이 있는 완결 SVG 문자열(순수). 이미지 #2 대응. */
import type { ApartmentTemplate, RoomSlot, RoomType } from "@/lib/types";

const SCALE = 40;      // px/m
const PAD = 36;
const HEADER_H = 44;
const FOOTER_H = 30;

const ROOM_FILL: Record<RoomType, string> = {
  living: "#EFE9DF", room: "#F1ECE2", kitchen: "#EDE7DC", bathroom: "#DDE6E6",
  balcony: "#E6ECE8", entrance: "#E8E2EC", other: "#ECE9E3",
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n: number) => Math.round(n * 10) / 10;

function bounds(rooms: RoomSlot[]) {
  const maxX = Math.max(...rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...rooms.map((r) => r.y + r.h));
  return { maxX, maxY };
}

export function renderPlanSvg(t: ApartmentTemplate, opts?: { title?: string }): string {
  const { maxX, maxY } = bounds(t.rooms);
  const w = maxX * SCALE + PAD * 2;
  const h = maxY * SCALE + PAD * 2 + HEADER_H + FOOTER_H;
  const title = esc(opts?.title ?? `${t.pyeongBand}평대 평면도`);

  const roomSvg = t.rooms.map((room) => {
    const x = room.x * SCALE + PAD;
    const y = room.y * SCALE + PAD + HEADER_H;
    const rw = room.w * SCALE;
    const rh = room.h * SCALE;
    const cx = x + rw / 2;
    const cy = y + rh / 2;
    return `<g>
  <rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="2"
    fill="${ROOM_FILL[room.type]}" stroke="#2B2B2B" stroke-width="2"/>
  <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="14" fill="#16181D"
    font-family="system-ui, sans-serif" font-weight="600">${esc(room.name)}</text>
  <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="#6B7280"
    font-family="system-ui, sans-serif">${r1(room.w)}×${r1(room.h)}m</text>
</g>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}"
  viewBox="0 0 ${r1(w)} ${r1(h)}" width="100%" style="max-height:560px"
  font-family="system-ui, sans-serif">
  <rect x="0" y="0" width="${r1(w)}" height="${r1(h)}" fill="#FFFFFF"/>
  <text x="${w / 2}" y="28" text-anchor="middle" font-size="20" font-weight="700"
    fill="#16181D">${title}</text>
${roomSvg}
  <text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="12" fill="#374151">
    전용면적 약 ${t.exclusiveM2}㎡ / 공급면적 약 ${t.supplyM2}㎡</text>
</svg>`;
}
