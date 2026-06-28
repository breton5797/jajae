// components/proposal/floorplan-sheet.tsx
/** 이미지 #2 — renderPlanSvg 결과를 그대로 출력하는 평면도 시트. */
import { renderPlanSvg } from "@/lib/proposal/floorplan-svg";
import type { ApartmentTemplate } from "@/lib/types";

export function FloorplanSheet({
  template,
  title,
}: {
  template: ApartmentTemplate;
  title?: string;
}) {
  const svg = renderPlanSvg(template, { title });
  return (
    <div
      className="w-full overflow-hidden rounded-xl border border-hairline bg-white"
      // SVG는 신뢰된 자체 생성 문자열(사용자 입력은 renderPlanSvg 내부에서 esc 처리됨)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
