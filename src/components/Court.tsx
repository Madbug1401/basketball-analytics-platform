"use client";

import { useRef } from "react";
import { COURT_H, COURT_W, CORNER_X, CORNER_Y, RIM, THREE_R } from "@/lib/court";
import { zoneGrid, type QZone } from "@/lib/shotQuality";
import { t } from "@/lib/i18n";

const GRID = zoneGrid(0.5);

export interface ShotMark {
  id: string;
  x: number;
  y: number;
  made: boolean;
  side?: "us" | "opp";
  highlight?: boolean;
}

const S = 20; // svg units per metre

export function Court({
  shots = [],
  onPick,
  pending,
  heat,
  className = "",
}: {
  shots?: ShotMark[];
  /** colour per zone (zone heat map drawn under the lines) */
  heat?: Partial<Record<QZone, string>>;
  onPick?: (x: number, y: number) => void;
  pending?: { x: number; y: number } | null;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPick || !ref.current) return;
    const pt = ref.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ref.current.getScreenCTM()!.inverse());
    const x = Math.min(COURT_W, Math.max(0, p.x / S));
    const y = Math.min(COURT_H, Math.max(0, p.y / S));
    onPick(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  };

  const arcStartX = CORNER_X * S;
  const arcEndX = (COURT_W - CORNER_X) * S;
  const cy = CORNER_Y * S;

  return (
    <svg
      ref={ref}
      viewBox={`-4 -4 ${COURT_W * S + 8} ${COURT_H * S + 8}`}
      className={`w-full select-none ${onPick ? "cursor-crosshair" : ""} ${className}`}
      onClick={click}
      role={onPick ? "button" : "img"}
      aria-label={t("Campo")}
    >
      <rect x={0} y={0} width={COURT_W * S} height={COURT_H * S} rx={4} fill="#1b2230" stroke="#3a4760" strokeWidth={2} />
      {heat && (
        <g aria-hidden>
          {GRID.map((c, i) => heat[c.zone] && <rect key={i} x={c.x * S} y={c.y * S} width={0.5 * S + 0.5} height={0.5 * S + 0.5} fill={heat[c.zone]} />)}
        </g>
      )}
      <g fill="none" stroke="#4b5a78" strokeWidth={1.5}>
        {/* paint */}
        <rect x={(RIM.x - 2.45) * S} y={0} width={4.9 * S} height={5.8 * S} fill={heat ? "none" : "#222b3c"} />
        <circle cx={RIM.x * S} cy={5.8 * S} r={1.8 * S} />
        {/* three point line */}
        <path d={`M ${arcStartX} 0 L ${arcStartX} ${cy} A ${THREE_R * S} ${THREE_R * S} 0 0 0 ${arcEndX} ${cy} L ${arcEndX} 0`} />
        {/* restricted area */}
        <path d={`M ${(RIM.x - 1.25) * S} ${RIM.y * S} A ${1.25 * S} ${1.25 * S} 0 0 0 ${(RIM.x + 1.25) * S} ${RIM.y * S}`} />
        {/* backboard + rim */}
        <line x1={(RIM.x - 0.9) * S} y1={1.2 * S} x2={(RIM.x + 0.9) * S} y2={1.2 * S} strokeWidth={3} stroke="#8a96ab" />
        <circle cx={RIM.x * S} cy={RIM.y * S} r={0.225 * S} stroke="#ff7a1a" strokeWidth={2} />
        {/* half court circle */}
        <path d={`M ${(RIM.x - 1.8) * S} ${COURT_H * S} A ${1.8 * S} ${1.8 * S} 0 0 1 ${(RIM.x + 1.8) * S} ${COURT_H * S}`} />
      </g>
      {shots.map((s) => {
        const cx = s.x * S;
        const cyy = s.y * S;
        const color = s.side === "opp" ? "#60a5fa" : s.made ? "#34d399" : "#f87171";
        const r = s.highlight ? 7 : 5;
        return s.made ? (
          <circle key={s.id} cx={cx} cy={cyy} r={r} fill={color} fillOpacity={0.85} stroke="#0b0e13" strokeWidth={1} />
        ) : (
          <g key={s.id} stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={0.9}>
            <line x1={cx - r} y1={cyy - r} x2={cx + r} y2={cyy + r} />
            <line x1={cx - r} y1={cyy + r} x2={cx + r} y2={cyy - r} />
          </g>
        );
      })}
      {pending && (
        <circle cx={pending.x * S} cy={pending.y * S} r={8} fill="none" stroke="#ff7a1a" strokeWidth={2.5}>
          <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
