"use client";

import { useEffect, useRef } from "react";
import type { RunStop } from "@/lib/types";

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

/**
 * KakaoMap route view for a delivery run. Renders an ordered stop list always,
 * and overlays a KakaoMap with markers + polyline when a key + coords exist.
 */
export function KakaoRouteMap({ stops }: { stops: RunStop[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const withCoords = stops.filter(
    (s) => typeof s.lat === "number" && typeof s.lng === "number",
  );

  useEffect(() => {
    if (!KAKAO_KEY || withCoords.length === 0 || !ref.current) return;
    const w = window as unknown as { kakao?: any };

    const draw = () => {
      const kakao = w.kakao;
      if (!kakao?.maps || !ref.current) return;
      const first = withCoords[0]!;
      const map = new kakao.maps.Map(ref.current, {
        center: new kakao.maps.LatLng(first.lat, first.lng),
        level: 6,
      });
      const path: any[] = [];
      withCoords.forEach((s, i) => {
        const pos = new kakao.maps.LatLng(s.lat, s.lng);
        path.push(pos);
        const marker = new kakao.maps.Marker({ position: pos, map });
        const label = new kakao.maps.CustomOverlay({
          position: pos,
          content: `<div style="background:#1A56DB;color:#fff;border-radius:9999px;width:20px;height:20px;text-align:center;font-size:12px;line-height:20px">${i + 1}</div>`,
          yAnchor: 2,
        });
        label.setMap(map);
        void marker;
      });
      new kakao.maps.Polyline({
        path,
        strokeWeight: 4,
        strokeColor: "#1A56DB",
        strokeOpacity: 0.8,
        map,
      });
    };

    if (w.kakao?.maps) {
      w.kakao.maps.load(draw);
      return;
    }
    const script = document.createElement("script");
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => w.kakao?.maps?.load(draw);
    document.head.appendChild(script);
  }, [withCoords]);

  return (
    <div className="space-y-2">
      {KAKAO_KEY && withCoords.length > 0 && (
        <div ref={ref} className="h-56 w-full rounded-lg border bg-muted" />
      )}
      <ol className="space-y-1 text-sm">
        {stops.map((s) => (
          <li key={s.poId} className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">
              {s.sequence}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              PO {s.poId.slice(0, 8)}
            </span>
          </li>
        ))}
      </ol>
      {!KAKAO_KEY && (
        <p className="text-xs text-muted-foreground">
          (NEXT_PUBLIC_KAKAO_MAP_KEY 설정 시 지도 경로가 표시됩니다)
        </p>
      )}
    </div>
  );
}
