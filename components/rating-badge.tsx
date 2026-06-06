import { Badge } from "@/components/ui/badge";
import { ratingTier } from "@/lib/ratings";

/** Public supplier trust badge from the composite score. Server-safe. */
export function RatingBadge({ composite }: { composite: number | undefined }) {
  if (!composite || composite <= 0) return null;
  const tier = ratingTier(composite, 1);
  const variant =
    tier === "최우수"
      ? "success"
      : tier === "주의"
        ? "destructive"
        : tier === "우수"
          ? "default"
          : "neutral";
  return (
    <Badge variant={variant} className="gap-0.5">
      ★ {composite.toFixed(1)}
    </Badge>
  );
}
