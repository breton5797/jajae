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

const StudioDomainSchema = z.enum([
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

// Inferred types (optional consumers may prefer these over lib/types)
export type Transform3DParsed = z.infer<typeof Transform3DSchema>;
export type SceneObjectParsed = z.infer<typeof SceneObjectSchema>;
export type DesignSceneParsed = z.infer<typeof DesignSceneSchema>;
