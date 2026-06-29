/**
 * Zod schemas for the instant-proposal domain.
 * Reuses brief enums from ai-quote/schema for cross-codebase consistency.
 */
import { z } from "zod";
import { SpecLevelSchema, ProjectTypeSchema, RoomTypeSchema } from "@/lib/ai-quote/schema";

const ProposalRoomSchema = z.object({
  name: z.string().min(1),
  type: RoomTypeSchema,
  widthM: z.number().nonnegative(),
  lengthM: z.number().nonnegative(),
});

export const ProposalBriefSchema = z.object({
  projectType: ProjectTypeSchema,
  specLevel: SpecLevelSchema,
  rooms: z.array(ProposalRoomSchema).min(1),
  pyeong: z.number().positive().nullish().transform((v) => v ?? undefined),
  budgetKRW: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  materialPrefs: z.array(z.string()).nullish().transform((v) => v ?? undefined),
  notes: z.string().nullish().transform((v) => v ?? undefined),
});

export const ProposalInputSchema = z.object({
  brief: ProposalBriefSchema,
  customerName: z.string().optional(),
});

export const ShareInputSchema = z.object({
  password: z.string().min(4),
  expiresInDays: z.number().int().min(1).max(90).default(7),
});

export const SharedAccessSchema = z.object({
  password: z.string().min(1),
});

export const RenderInputSchema = z.object({
  imageBase64: z.string().min(1), // 3D 스냅샷 dataURL
  prompt: z.string().optional(),
});

export const FinishMaterialSchema = z.object({
  id: z.string(),
  category: z.string(),
  tier: z.enum(["economy", "standard", "premium"]),
  brandId: z.string(),
  brandName: z.string().optional(),
  label: z.string(),
  unitPrice: z.number(),
  priceStatus: z.enum(["confirmed", "estimated"]),
  color: z.string().optional(),
  swatchUrl: z.string().optional(),
  spec: z.string().optional(),
});
