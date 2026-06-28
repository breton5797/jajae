/**
 * Zod schemas for the interior-estimate domain.
 * Reuses SpecLevelSchema / ProjectTypeSchema / RoomTypeSchema from ai-quote/schema
 * so enum literals stay consistent across the codebase.
 */
import { z } from "zod";
import {
  SpecLevelSchema,
  ProjectTypeSchema,
  RoomTypeSchema,
} from "@/lib/ai-quote/schema";

/** Input to POST /api/estimate/transcribe */
export const TranscribeSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

const EstimateRoomSchema = z.object({
  name: z.string().min(1),
  type: RoomTypeSchema,
  widthM: z.number().nonnegative(),
  lengthM: z.number().nonnegative(),
});

/**
 * Shape of EstimateBrief — also used to validate Claude JSON output.
 * Optional fields use .nullish().transform so null from Claude is coerced
 * to undefined instead of failing the whole parse.
 */
export const BriefSchema = z.object({
  projectType: ProjectTypeSchema,
  specLevel: SpecLevelSchema,
  rooms: z.array(EstimateRoomSchema).min(1),
  budgetKRW: z
    .number()
    .nonnegative()
    .nullish()
    .transform((v) => v ?? undefined),
  materialPrefs: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? undefined),
  notes: z.string().nullish().transform((v) => v ?? undefined),
});

/** Input to POST /api/estimate (Phase B) */
export const EstimateInputSchema = z.object({
  brief: BriefSchema,
  customerName: z.string().optional(),
});
