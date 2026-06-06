import { z } from "zod";

export const SpecLevelSchema = z.enum(["economy", "standard", "premium"]);
export const ProjectTypeSchema = z.enum([
  "apartment_remodel",
  "bathroom",
  "kitchen",
  "commercial_interior",
  "new_build",
]);

export const BomInputSchema = z.object({
  projectType: ProjectTypeSchema,
  areaPyeong: z.number().positive().max(10_000),
  dimensions: z
    .object({
      bathroomCount: z.number().int().min(0).max(50).optional(),
      ceilingHeightM: z.number().positive().max(20).optional(),
      wallAreaM2: z.number().positive().max(100_000).optional(),
    })
    .optional(),
  specLevel: SpecLevelSchema,
});

export type BomInputParsed = z.infer<typeof BomInputSchema>;

/** Shape Claude is asked to return; validated before trusting it. */
export const AiBomLineSchema = z.object({
  category: z.string().min(1),
  categorySlug: z.string().min(1),
  item: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1),
  estUnitPrice: z.number().nonnegative(),
});

export const AiBomSchema = z.object({
  lines: z.array(AiBomLineSchema).min(1),
});

/* ---------- drawing analysis ---------- */

export const RoomTypeSchema = z.enum([
  "living",
  "room",
  "bathroom",
  "kitchen",
  "balcony",
  "entrance",
  "other",
]);

export const RoomAreaSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  areaM2: z.number().nonnegative().max(100_000),
});

export const RoomsSchema = z.object({
  rooms: z.array(RoomAreaSchema).min(1),
});

export const DrawingAnalyzeSchema = z.object({
  imageBase64: z.string().optional(),
  mimeType: z.string().optional(),
  rooms: z
    .array(
      z.object({
        name: z.string().min(1),
        type: RoomTypeSchema,
        areaM2: z.number().positive().max(100_000),
      }),
    )
    .optional(),
  specLevel: SpecLevelSchema,
  projectType: ProjectTypeSchema.optional(),
});
