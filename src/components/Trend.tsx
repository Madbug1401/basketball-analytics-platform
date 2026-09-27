"use client";

import { t } from "@/lib/i18n";

export interface Series { label: string; color: string; values: (number | null)[] }

/** Minimal responsive line chart for per-game trends. */
export function Trend({ labels, series, height = 180 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 600, H = height, pl = 32, pr = 12, pt = 12, pb = 26;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (!labels.length || !all.length) return <p className="py-8 text-center text-sm text-muted">{t("Sem dados suficientes ainda.")}</p>;
  const max = Math.max(1, ...all);
  const niceMax = Math.ceil(max / 5) * 5;
  const x = (i: number) => pl + (labels.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (labels.length - 1));
  const y = (v: number) => pt + (1 - v / niceMax) * (H - pt - pb);
  const ticks = [0, niceMax / 2, niceMax];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pl} x2={W - pr} y1={y(tk)} y2={y(tk)} stroke="#263044" strokeDasharray={tk ? "3 4" : undefined} />
            <text x={pl - 6} y={y(tk) + 4} textAnchor="end" fontSize="10" fill="#8a96ab">{tk}</text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8a96ab">{l}</text>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter(Boolean) as (readonly [number, number])[];
          return (
            <g key={s.label}>
              <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={s.color}><title>{`${s.label}: ${s.values.filter((v) => v !== null)[i]}`}</title></circle>)}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-4 px-2 text-xs text-muted">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
    </div>
  );
}
