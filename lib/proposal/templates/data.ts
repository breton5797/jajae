// lib/proposal/templates/data.ts
/** 표준 한국 아파트 평면 템플릿 (10~50평대). 좌표 단위 m, 원점 좌상단. */
import type { ApartmentTemplate, Transform3D } from "@/lib/types";

const tf = (x: number, z: number, ry = 0): Transform3D => ({
  position: [x, 0, z], rotation: [0, ry, 0], scale: [1, 1, 1],
});

export const APARTMENT_TEMPLATES: ApartmentTemplate[] = [
  {
    id: "apt-10s-1room-1bath", pyeongBand: 10, exclusiveM2: 33, supplyM2: 43,
    bedrooms: 1, bathrooms: 1,
    rooms: [
      { name: "거실/주방", type: "living", x: 0, y: 0, w: 4, h: 4 },
      { name: "침실", type: "room", x: 4, y: 0, w: 3, h: 3 },
      { name: "욕실", type: "bathroom", x: 4, y: 3, w: 2, h: 2 },
      { name: "현관", type: "entrance", x: 0, y: 4, w: 1.5, h: 1.5 },
      { name: "발코니", type: "balcony", x: 0, y: 5.5, w: 4, h: 1.2 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실/주방", transform: tf(1.5, 1.5) },
      { assetId: "bed", roomName: "침실", transform: tf(5.5, 1.5) },
    ],
  },
  {
    id: "apt-20s-3room-2bath", pyeongBand: 20, exclusiveM2: 59, supplyM2: 82,
    bedrooms: 3, bathrooms: 2,
    rooms: [
      { name: "거실", type: "living", x: 2, y: 3, w: 4, h: 4 },
      { name: "주방/식당", type: "kitchen", x: 2, y: 0, w: 4, h: 3 },
      { name: "안방", type: "room", x: 0, y: 5, w: 2, h: 3 },
      { name: "침실1", type: "room", x: 6, y: 4, w: 3, h: 3.5 },
      { name: "침실2", type: "room", x: 6, y: 0, w: 3, h: 2.5 },
      { name: "욕실1", type: "bathroom", x: 0, y: 3, w: 2, h: 2 },
      { name: "욕실2", type: "bathroom", x: 5, y: 2.5, w: 1.5, h: 1.5 },
      { name: "현관", type: "entrance", x: 0, y: 0, w: 2, h: 1.5 },
      { name: "발코니", type: "balcony", x: 0, y: 8, w: 6, h: 1.4 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실", transform: tf(3.5, 5.5) },
      { assetId: "table", roomName: "주방/식당", transform: tf(4, 1.5) },
      { assetId: "bed", roomName: "안방", transform: tf(1, 6.5) },
      { assetId: "bed", roomName: "침실1", transform: tf(7.5, 5.5) },
    ],
  },
  {
    id: "apt-30s-3room-2bath", pyeongBand: 30, exclusiveM2: 84, supplyM2: 110,
    bedrooms: 3, bathrooms: 2,
    rooms: [
      { name: "거실", type: "living", x: 3, y: 3, w: 5, h: 4.5 },
      { name: "주방/식당", type: "kitchen", x: 3, y: 0, w: 5, h: 3 },
      { name: "안방", type: "room", x: 0, y: 4, w: 3, h: 4 },
      { name: "침실1", type: "room", x: 8, y: 4, w: 3.5, h: 3.5 },
      { name: "침실2", type: "room", x: 8, y: 0, w: 3.5, h: 3 },
      { name: "욕실1", type: "bathroom", x: 0, y: 1.5, w: 2.5, h: 2.5 },
      { name: "욕실2", type: "bathroom", x: 6.5, y: 2.5, w: 1.5, h: 1.5 },
      { name: "현관", type: "entrance", x: 0, y: 0, w: 2.5, h: 1.5 },
      { name: "발코니", type: "balcony", x: 0, y: 8.5, w: 8, h: 1.5 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실", transform: tf(5, 5.5) },
      { assetId: "table", roomName: "주방/식당", transform: tf(5.5, 1.5) },
      { assetId: "bed", roomName: "안방", transform: tf(1.5, 6) },
      { assetId: "bed", roomName: "침실1", transform: tf(9.5, 5.5) },
    ],
  },
  {
    id: "apt-40s-4room-2bath", pyeongBand: 40, exclusiveM2: 114, supplyM2: 148,
    bedrooms: 4, bathrooms: 2,
    rooms: [
      { name: "거실", type: "living", x: 3, y: 3.5, w: 6, h: 5 },
      { name: "주방/식당", type: "kitchen", x: 3, y: 0, w: 6, h: 3.5 },
      { name: "안방", type: "room", x: 0, y: 4, w: 3, h: 4.5 },
      { name: "침실1", type: "room", x: 9, y: 5, w: 4, h: 3.5 },
      { name: "침실2", type: "room", x: 9, y: 0, w: 4, h: 3 },
      { name: "침실3", type: "room", x: 9, y: 3, w: 4, h: 2 },
      { name: "욕실1", type: "bathroom", x: 0, y: 1.5, w: 3, h: 2.5 },
      { name: "욕실2", type: "bathroom", x: 7, y: 3, w: 2, h: 1.5 },
      { name: "현관", type: "entrance", x: 0, y: 0, w: 3, h: 1.5 },
      { name: "발코니", type: "balcony", x: 0, y: 9, w: 9, h: 1.6 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실", transform: tf(6, 6) },
      { assetId: "table", roomName: "주방/식당", transform: tf(6, 1.75) },
      { assetId: "bed", roomName: "안방", transform: tf(1.5, 6.25) },
      { assetId: "bed", roomName: "침실1", transform: tf(11, 6.75) },
    ],
  },
  {
    id: "apt-50s-4room-3bath", pyeongBand: 50, exclusiveM2: 145, supplyM2: 185,
    bedrooms: 4, bathrooms: 3,
    rooms: [
      { name: "거실", type: "living", x: 3.5, y: 4, w: 7, h: 5.5 },
      { name: "주방/식당", type: "kitchen", x: 3.5, y: 0, w: 7, h: 4 },
      { name: "안방", type: "room", x: 0, y: 4.5, w: 3.5, h: 5 },
      { name: "드레스룸", type: "other", x: 0, y: 2.5, w: 3.5, h: 2 },
      { name: "침실1", type: "room", x: 10.5, y: 5.5, w: 4.5, h: 4 },
      { name: "침실2", type: "room", x: 10.5, y: 0, w: 4.5, h: 3 },
      { name: "침실3", type: "room", x: 10.5, y: 3, w: 4.5, h: 2.5 },
      { name: "욕실1", type: "bathroom", x: 0, y: 0, w: 3.5, h: 2.5 },
      { name: "욕실2", type: "bathroom", x: 8, y: 3.5, w: 2.5, h: 2 },
      { name: "욕실3", type: "bathroom", x: 8, y: 0, w: 2.5, h: 2 },
      { name: "발코니", type: "balcony", x: 0, y: 10, w: 10.5, h: 1.8 },
    ],
    furniture: [
      { assetId: "sofa", roomName: "거실", transform: tf(7, 6.75) },
      { assetId: "table", roomName: "주방/식당", transform: tf(7, 2) },
      { assetId: "bed", roomName: "안방", transform: tf(1.75, 7) },
      { assetId: "bed", roomName: "침실1", transform: tf(12.75, 7.5) },
    ],
  },
];
