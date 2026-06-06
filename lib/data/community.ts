import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { summarizeReviews } from "@/lib/community";
import type { CommunityPost, Review, ReviewAggregate } from "@/lib/types";

export interface ProductReviews {
  reviews: Review[];
  aggregate: ReviewAggregate;
}

export async function loadProductReviews(
  productId: string,
): Promise<ProductReviews> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("reviews")
      .select("*")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });
    const reviews = (data ?? []) as Review[];
    return {
      reviews,
      aggregate: summarizeReviews(
        reviews.map((r) => ({ rating: r.rating, body: r.body })),
      ),
    };
  } catch {
    return { reviews: [], aggregate: summarizeReviews([]) };
  }
}

export async function loadCommunityPosts(): Promise<CommunityPost[]> {
  try {
    const sb = createServerSupabase();
    const { data } = await sb
      .from("community_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []) as CommunityPost[];
  } catch {
    return [];
  }
}
