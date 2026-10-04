import { useState } from 'react';
import type { Bucket, Group } from '../engine/history';
import { S } from '../strings';

const W = 340;
const H = 190;
const M = { l: 44, r: 8, t: 12, b: 26 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1, 2, 5 x 10^k at or above v. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function bucketLabel(b: Bucket, group: Group): string {
  const d = new Date(b.start);
  if (group === 'month') return `${MONTHS[d.getMonth()]} ’${String(d.getFullYear()).slice(2)}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Dependency-free bar chart. Tap or focus a bar to read its value. */
export function BarChart({
  buckets,
  group,
  format,
  metricLabel,
  isTime,
}: {
  buckets: Bucket[];
  group: Group;
  format: (v: number) => string;
  metricLabel: string;
  isTime: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  if (buckets.length === 0) return <p className="muted">{S.chartEmpty}</p>;

  const max = Math.max(...buckets.map((b) => b.value), 0);
  // Time axes step in whole minutes once the biggest bar passes 2 minutes.
  const unit = isTime && max >= 120 ? 60 : 1;
  const top = niceMax(max / unit) * unit;
  const n = buckets.length;
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const slot = plotW / n;
  const barW = Math.max(2, slot * 0.7);
  const y = (v: number) => M.t + plotH - (v / top) * plotH;
  const every = Math.ceil(n / 6);
  const sel = picked !== null && picked < n ? buckets[picked] : null;
  const prefix = group === 'week' ? `${S.weekOf} ` : '';
  const describe = (b: Bucket) => `${prefix}${bucketLabel(b, group)}: ${format(b.value)}`;
  const peak = buckets.reduce((a, b) => (b.value > a.value ? b : a), buckets[0]);

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${metricLabel} per ${group}. ${n} ${group}s. Highest: ${describe(peak)}.`}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="chartGrid" x1={M.l} x2={W - M.r} y1={y(top * f)} y2={y(top * f)} />
            <text className="chartAxis" x={M.l - 6} y={y(top * f) + 4} textAnchor="end">
              {format(Math.round(top * f * 10) / 10)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = M.l + i * slot + (slot - barW) / 2;
          const h = Math.max(0, M.t + plotH - y(b.value));
          return (
            <g key={b.key}>
              {b.value > 0 && <rect className={`chartBar${picked === i ? ' chartBarOn' : ''}`} x={x} y={y(b.value)} width={barW} height={h} rx={Math.min(3, barW / 2)} />}
              {n <= 10 && b.value > 0 && (
                <text className="chartValue" x={x + barW / 2} y={y(b.value) - 4} textAnchor="middle">
                  {format(b.value)}
                </text>
              )}
              {i % every === 0 && (
                <text className="chartAxis" x={x + barW / 2} y={H - 8} textAnchor="middle">
                  {bucketLabel(b, group)}
                </text>
              )}
              <rect
                className="chartHit"
                x={M.l + i * slot}
                y={M.t}
                width={slot}
                height={plotH}
                tabIndex={0}
                role="button"
                aria-label={describe(b)}
                onClick={() => setPicked(i)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPicked(i)}
              />
            </g>
          );
        })}
      </svg>
      <p className="muted chartPick" aria-live="polite">
        {sel ? describe(sel) : S.tapBar}
      </p>
    </div>
  );
}
