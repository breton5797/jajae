/**
 * Zod schemas for the 3D Studio domain.
 * Validates DesignScene at API/persistence boundaries.
 */
import { z } from "zod";

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const Transform3DSchema = z.object({
  position: Vec3Schema,
  rotation: Vec3Schema,
  scale: Vec3Schema,
});

export const SceneObjectSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  name: z.string().min(1),
  transform: Transform3DSchema,
  color: z.string().optional(),
  params: z.record(z.string(), z.number()).optional(),
});

export const StudioDomainSchema = z.enum([
  "interior",
  "architecture",
  "landscape",
  "webtoon_bg",
  "stage",
  "signage",
  "furniture",
]);

export const DesignSceneSchema = z.object({
  id: z.string().min(1),
  domain: StudioDomainSchema,
  objects: z.array(SceneObjectSchema),
  ground: z.object({
    type: z.enum(["floor", "terrain", "none"]),
    sizeM: z.number().positive(),
  }),
  camera: z.object({
    position: Vec3Schema,
    target: Vec3Schema,
  }),
});

/** AI 실사 프리뷰 요청(스튜디오 뷰포트 스냅샷 → 도메인 맞춤 포토리얼). */
export const StudioRenderSchema = z.object({
  imageBase64: z.string().min(1), // 뷰포트 스냅샷 dataURL
  domain: StudioDomainSchema,
});

/** design_scenes 저장 페이로드(에디터 → 영속화 경계). */
export const SaveScenePayloadSchema = z.object({
  name: z.string().min(1).max(120),
  domain: StudioDomainSchema,
  scene: DesignSceneSchema,
  snapshot: z.string().optional(), // 썸네일용 PNG dataURL — 서버가 Storage 업로드
});

// Inferred types (optional consumers may prefer these over lib/types)
export type Transform3DParsed = z.infer<typeof Transform3DSchema>;
export type SceneObjectParsed = z.infer<typeof SceneObjectSchema>;
export type DesignSceneParsed = z.infer<typeof DesignSceneSchema>;
export type StudioRenderParsed = z.infer<typeof StudioRenderSchema>;
export type SaveScenePayloadParsed = z.infer<typeof SaveScenePayloadSchema>;
