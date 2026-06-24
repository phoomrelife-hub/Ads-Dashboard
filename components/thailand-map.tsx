"use client";
import { useEffect, useState } from "react";

type Geo = { features: { properties: { name: string }; geometry: any }[] };
let GEO_CACHE: Geo | null = null;

const norm = (s: string) => (s || "").toLowerCase().replace(/province|metropolis/g, "").replace(/[^a-z]/g, "");

function lerp(a: string, b: string, t: number) {
  const h = (x: string) => parseInt(x, 16);
  const c = (i: number) => Math.round(h(a.slice(i, i + 2)) + (h(b.slice(i, i + 2)) - h(a.slice(i, i + 2))) * t);
  return `rgb(${c(1)},${c(3)},${c(5)})`;
}

export function ThailandMap({
  rows, metricKey, fmt,
}: { rows: Record<string, any>[]; metricKey: string; fmt: (v: number) => string }) {
  const [geo, setGeo] = useState<Geo | null>(GEO_CACHE);

  useEffect(() => {
    if (GEO_CACHE) { setGeo(GEO_CACHE); return; }
    fetch("/thailand.json").then((r) => r.json()).then((j) => { GEO_CACHE = j; setGeo(j); });
  }, []);

  if (!geo) return <div className="py-20 text-center text-slate-500">⏳ กำลังโหลดแผนที่...</div>;

  // projection (equirectangular with longitude correction)
  let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
  const each = (cb: (pt: number[]) => void) => {
    for (const f of geo.features) {
      const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (const poly of polys) for (const ring of poly) for (const pt of ring) cb(pt);
    }
  };
  each(([lon, lat]) => { minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); });
  const cos = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180), W = 440;
  const xmin = minLon * cos, s = W / ((maxLon - minLon) * cos), H = s * (maxLat - minLat);
  const proj = ([lon, lat]: number[]) => [((lon * cos) - xmin) * s, H - (lat - minLat) * s];
  const ring = (r: number[][]) => r.map((pt, i) => (i ? "L" : "M") + proj(pt).map((x) => x.toFixed(1)).join(",")).join("") + "Z";
  const pathOf = (g: any) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map((poly: any) => poly.map(ring).join("")).join("");

  // values by province
  const vals: Record<string, number> = {};
  let max = 0;
  for (const r of rows) { const k = norm(String(r.key)); vals[k] = (vals[k] || 0) + (Number(r[metricKey]) || 0); if (vals[k] > max) max = vals[k]; }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-[560px]" xmlns="http://www.w3.org/2000/svg">
      {geo.features.map((f, i) => {
        const v = vals[norm(f.properties.name)] || 0;
        const t = max ? Math.sqrt(v / max) : 0;
        const fill = v > 0 ? lerp("#26303d", "#ff3b3b", t) : "#161d27";
        return (
          <path key={i} d={pathOf(f.geometry)} fill={fill} stroke="#0a0e14" strokeWidth={0.4}
            className="transition-colors hover:stroke-white hover:[stroke-width:1.2]">
            <title>{f.properties.name}: {fmt(v)}</title>
          </path>
        );
      })}
    </svg>
  );
}
