import { useId, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TICK = { fill: '#8A867E', fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' };
const LINE = '#E8E6E1';

function TrendTick({ x, y, payload, index, labelEvery, marksByIndex }) {
  const mark = marksByIndex.get(index);
  const showLabel = index % labelEvery === 0;
  return (
    <g transform={`translate(${x},${y})`}>
      {mark && <g transform="translate(-7,0)">{mark}</g>}
      {showLabel ? (
        <text y="32" textAnchor="middle" {...TICK}>{payload.value}</text>
      ) : null}
    </g>
  );
}

function TrendTip({ active, payload, label: seriesLabel, formatValue, formatTitle }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const value = payload[0]?.value;
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-pop">
      <p className="text-caption font-semibold text-meta">{formatTitle(row)}</p>
      <p className="mt-1 font-mono text-lg font-extrabold text-ink">{formatValue(value)}</p>
      {seriesLabel && <p className="mt-0.5 text-xs text-meta">{seriesLabel}</p>}
    </div>
  );
}

/**
 * Smooth single-line area chart with a soft gradient fill, right-aligned y-axis,
 * date markers beneath the x-axis, and a live hover/drag indicator
 * (guide line + dot + floating tooltip) that tracks the pointer continuously.
 */
export function TrendChart({
  data = [],
  xKey = 'label',
  valueKey = 'value',
  color = '#2563EB',
  tint = '#EAF0FE',
  markers = [],
  labelEvery = 1,
  height = 280,
  formatY = (v) => `${v}`,
  formatValue = (v) => `${v.toLocaleString('en-IN')}`,
  formatTitle = (row) => String(row?.[xKey] ?? ''),
  seriesLabel = '',
}) {
  const gradId = useId().replace(/[:()]/g, '');
  const [active, setActive] = useState(undefined);

  const marksByIndex = useMemo(() => {
    const map = new Map();
    markers.forEach((m) => {
      if (m && typeof m.index === 'number') map.set(m.index, m.icon);
    });
    return map;
  }, [markers]);

  const activeRow = active == null ? undefined : data[Math.min(Math.max(active, 0), data.length - 1)];

  return (
    <div className="w-full select-none" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 14, right: 8, left: 4, bottom: 0 }}
          onMouseMove={(s) => setActive(typeof s?.activeTooltipIndex === 'number' ? s.activeTooltipIndex : undefined)}
          onMouseLeave={() => setActive(undefined)}>
          <defs>
            <linearGradient id={`tg-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tint} stopOpacity="1" />
              <stop offset="100%" stopColor={tint} stopOpacity="0" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={LINE} />
          <XAxis
            dataKey={xKey}
            height={48}
            interval={0}
            tickLine={false}
            axisLine={{ stroke: LINE }}
            tick={(props) => <TrendTick {...props} labelEvery={labelEvery} marksByIndex={marksByIndex} />} />
          <YAxis
            orientation="right"
            width={52}
            tickLine={false}
            axisLine={false}
            tick={TICK}
            tickFormatter={formatY} />
          <Tooltip
            cursor={false}
            offset={10}
            content={<TrendTip formatValue={formatValue} formatTitle={formatTitle} seriesLabel={seriesLabel} />} />
          <Area
            type="monotone"
            dataKey={valueKey}
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill={`url(#tg-${gradId})`}
            dot={false}
            activeDot={false} />
          {activeRow && (
            <>
              <ReferenceLine
                ifOverflow="extend"
                stroke={color}
                strokeOpacity={0.3}
                strokeWidth={1.5}
                x={activeRow[xKey]} />
              <ReferenceDot
                ifOverflow="extend"
                cx={activeRow[xKey]}
                cy={activeRow[valueKey]}
                r={4}
                fill="#FFFFFF"
                stroke={color}
                strokeWidth={2.5} />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}