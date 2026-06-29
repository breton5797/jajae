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

// ─── 가구 아이콘(탑다운) ──────────────────────────────────────────────
const F_STROKE = "#A2957C";
const WOOD = "#D8CDBA";
const FABRIC = "#C4CDD3";
const SANITARY = "#EDEFEE";
const clamp = (v: number, max: number) => Math.min(v, max);

function rrect(
  x: number, y: number, w: number, h: number, rx: number,
  fill: string, stroke = F_STROKE, sw = 1,
): string {
  return `<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}
function circ(cx: number, cy: number, rad: number, fill: string, stroke = F_STROKE): string {
  return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(rad)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
}

/** 침대: 매트리스 + 베개 + 이불선. */
function bedGlyph(x: number, y: number, w: number, h: number): string {
  const bw = clamp(w * 0.6, 70);
  const bh = clamp(h * 0.62, 92);
  const bx = x + (w - bw) / 2;
  const by = y + (h - bh) / 2 + 4;
  return `<g data-furniture="bed">${rrect(bx, by, bw, bh, 4, "#ECE7DD")}${rrect(
    bx + bw * 0.12, by + 4, bw * 0.76, bh * 0.2, 3, "#FBFAF7",
  )}<line x1="${r1(bx)}" y1="${r1(by + bh * 0.34)}" x2="${r1(bx + bw)}" y2="${r1(by + bh * 0.34)}" stroke="${F_STROKE}" stroke-width="1"/></g>`;
}

/** 거실: 소파(좌측 벽) + 등받이 + 커피테이블(중앙). */
function livingGlyph(x: number, y: number, w: number, h: number): string {
  const len = clamp(h * 0.6, 92);
  const depth = clamp(w * 0.22, 34);
  const sx = x + 6;
  const sy = y + (h - len) / 2;
  const sofa = `${rrect(sx, sy, depth, len, 5, FABRIC)}${rrect(sx, sy, depth * 0.35, len, 3, "#AFBAC2")}`;
  const ctW = clamp(w * 0.3, 52);
  const ctH = clamp(h * 0.26, 34);
  const coffee = rrect(x + w * 0.52 - ctW / 2, y + h / 2 - ctH / 2, ctW, ctH, 4, WOOD);
  return `<g data-furniture="sofa">${sofa}${coffee}</g>`;
}

/** 주방/식당: 상부 싱크대(싱크+화구) + 식탁 + 의자. */
function kitchenGlyph(x: number, y: number, w: number, h: number): string {
  const cd = clamp(h * 0.22, 20);
  const counter = rrect(x + 4, y + 4, w - 8, cd, 2, "#E7E2D7");
  const sink = rrect(x + w * 0.2 - 8, y + 4 + cd * 0.2, 16, cd * 0.6, 2, SANITARY);
  const hob1 = circ(x + w * 0.62, y + 4 + cd * 0.5, clamp(cd * 0.28, 5), "#CFC9BC");
  const hob2 = circ(x + w * 0.74, y + 4 + cd * 0.5, clamp(cd * 0.28, 5), "#CFC9BC");
  const tW = clamp(w * 0.4, 60);
  const tH = clamp(h * 0.3, 40);
  const tx = x + (w - tW) / 2;
  const ty = y + h * 0.58 - tH / 2;
  const table = rrect(tx, ty, tW, tH, 5, WOOD);
  const chairs = `${rrect(tx - 10, ty + tH * 0.25, 8, tH * 0.5, 2, "#E7E2D7")}${rrect(tx + tW + 2, ty + tH * 0.25, 8, tH * 0.5, 2, "#E7E2D7")}`;
  return `<g data-furniture="kitchen">${counter}${sink}${hob1}${hob2}${table}${chairs}</g>`;
}

/** 욕실: 변기 + 세면대 + 샤워부스. */
function bathGlyph(x: number, y: number, w: number, h: number): string {
  const tw = clamp(w * 0.3, 16);
  const toilet = `${rrect(x + 5, y + 5, tw, 6, 1, SANITARY)}${rrect(x + 5, y + 10, tw, 11, 5, SANITARY)}`;
  const sw = clamp(w * 0.3, 18);
  const sink = rrect(x + w - 5 - sw, y + 5, sw, 11, 3, SANITARY);
  const ss = clamp(Math.min(w, h) * 0.4, 26);
  const shower = rrect(x + w - 5 - ss, y + h - 5 - ss, ss, ss, 2, "#E2E8E8");
  return `<g data-furniture="bath">${toilet}${sink}${shower}</g>`;
}

/** 드레스룸·기타: 벽면 붙박이장. */
function wardrobeGlyph(x: number, y: number, w: number, h: number): string {
  return `<g data-furniture="wardrobe">${rrect(x + 4, y + 4, w - 8, clamp(h * 0.25, 18), 2, WOOD)}</g>`;
}

/** 현관: 신발장. */
function entranceGlyph(x: number, y: number, w: number, h: number): string {
  return `<g data-furniture="cabinet">${rrect(x + 4, y + 4, clamp(w * 0.55, 24), clamp(h * 0.3, 12), 2, WOOD)}</g>`;
}

/** 발코니: 화분. */
function balconyGlyph(x: number, y: number, _w: number, h: number): string {
  return `<g data-furniture="plant">${circ(x + 12, y + h / 2, 5, "#9DB89D", "#6E8C6E")}${circ(x + 24, y + h / 2, 4, "#9DB89D", "#6E8C6E")}</g>`;
}

/** 룸 타입별 가구 아이콘. 너무 작은 칸은 생략. */
function furnitureFor(type: RoomType, x: number, y: number, w: number, h: number): string {
  if (w < 26 || h < 26) return "";
  switch (type) {
    case "room": return bedGlyph(x, y, w, h);
    case "living": return livingGlyph(x, y, w, h);
    case "kitchen": return kitchenGlyph(x, y, w, h);
    case "bathroom": return bathGlyph(x, y, w, h);
    case "other": return wardrobeGlyph(x, y, w, h);
    case "entrance": return entranceGlyph(x, y, w, h);
    case "balcony": return balconyGlyph(x, y, w, h);
    default: return "";
  }
}

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
  ${furnitureFor(room.type, x, y, rw, rh)}
  <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="14" fill="#16181D"
    font-family="system-ui, sans-serif" font-weight="600"
    style="paint-order:stroke" stroke="#FFFFFF" stroke-width="3">${esc(room.name)}</text>
  <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="#6B7280"
    font-family="system-ui, sans-serif"
    style="paint-order:stroke" stroke="#FFFFFF" stroke-width="2.5">${r1(room.w)}×${r1(room.h)}m</text>
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
