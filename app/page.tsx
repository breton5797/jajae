import { Hero } from "@/components/landing/hero";
import { CapabilityList } from "@/components/landing/capability-list";
import { AiQuoteSpotlight } from "@/components/landing/ai-quote-spotlight";
import { PoSplitSpotlight } from "@/components/landing/po-split-spotlight";
import { ClosingCta } from "@/components/landing/closing-cta";

export default function HomePage() {
  return (
    <div className="full-bleed -my-5 bg-paper text-ink">
      <Hero />
      <CapabilityList />
      <AiQuoteSpotlight />
      <PoSplitSpotlight />
      <ClosingCta />
    </div>
  );
}
