import { Component, createMemo, For } from 'solid-js';
import type { Swimmer, StrokeType } from '../types';
import { formatTime } from '../services/wsClient';

const STROKES: StrokeType[] = ['自由泳', '蛙泳', '蝶泳', '仰泳'];

const COMPARE_COLORS = [
  { main: '#3b82f6', light: '#60a5fa', fillOpacity: 0.4 },
  { main: '#ef4444', light: '#f87171', fillOpacity: 0.3 },
  { main: '#10b981', light: '#34d399', fillOpacity: 0.3 },
  { main: '#f59e0b', light: '#fbbf24', fillOpacity: 0.3 },
];

interface Props {
  swimmer: Swimmer;
  compareSwimmers?: Swimmer[];
  size?: number;
  showSplitComparison?: boolean;
  splitTimes?: number[];
  compareSplitTimes?: number[][];
}

export const RadarChart: Component<Props> = (props) => {
  const size = () => props.size || 300;
  const center = () => size() / 2;
  const radius = () => size() * 0.38;

  const maxTime = 100;
  const minTime = 40;

  const allSwimmers = createMemo(() => {
    const swimmers = [props.swimmer];
    if (props.compareSwimmers && props.compareSwimmers.length > 0) {
      swimmers.push(...props.compareSwimmers.slice(0, 3));
    }
    return swimmers;
  });

  const normalizeValue = (value: number | null): number => {
    if (value === null) return 0;
    const normalized = 1 - (value - minTime) / (maxTime - minTime);
    return Math.max(0, Math.min(1, normalized));
  };

  const getPoint = (index: number, value: number | null, r: number) => {
    const angle = (Math.PI * 2 * index) / STROKES.length - Math.PI / 2;
    const actualRadius = r * normalizeValue(value);
    return {
      x: center() + actualRadius * Math.cos(angle),
      y: center() + actualRadius * Math.sin(angle),
    };
  };

  const getLabelPoint = (index: number) => {
    const angle = (Math.PI * 2 * index) / STROKES.length - Math.PI / 2;
    const labelRadius = radius() + 36;
    return {
      x: center() + labelRadius * Math.cos(angle),
      y: center() + labelRadius * Math.sin(angle),
    };
  };

  const getSwimmerPoints = (swimmerIndex: number) => {
    const swimmer = allSwimmers()[swimmerIndex];
    return STROKES.map((stroke, i) => {
      const p = getPoint(i, swimmer.pb[stroke], radius());
      return `${p.x},${p.y}`;
    }).join(' ');
  };

  const getSwimmerFillId = (index: number) => `swimmer${index + 1}Fill`;

  const gridLevels = [0.25, 0.5, 0.75, 1];

  const showSplitComparison = () => 
    props.showSplitComparison && props.splitTimes && props.splitTimes.length > 0;

  const allSplitTimes = createMemo(() => {
    const splits: number[][] = [];
    if (props.splitTimes) splits.push(props.splitTimes);
    if (props.compareSplitTimes) {
      splits.push(...props.compareSplitTimes.slice(0, 3));
    }
    return splits;
  });

  const maxSplitInterval = createMemo(() => {
    let max = 0;
    allSplitTimes().forEach(splits => {
      splits.forEach((time, idx) => {
        const prev = idx > 0 ? splits[idx - 1] : 0;
        const interval = time - prev;
        if (interval > max) max = interval;
      });
    });
    return max || 1;
  });

  return (
    <div class="radar-chart-container">
      <h3 class="chart-title">
        📊 {allSwimmers().length > 1 ? `${allSwimmers().length}名运动员成绩对比` : '四种泳姿 PB 成绩'}
      </h3>
      
      <div class="chart-wrapper">
        <svg width={size()} height={size()} viewBox={`0 0 ${size()} ${size()}`}>
          <defs>
            <For each={allSwimmers()}>
              {(_, i) => {
                const color = COMPARE_COLORS[i()];
                return (
                  <radialGradient id={getSwimmerFillId(i())} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color={color.main} stop-opacity={color.fillOpacity} />
                    <stop offset="100%" stop-color={color.main} stop-opacity={color.fillOpacity * 0.25} />
                  </radialGradient>
                );
              }}
            </For>
          </defs>

          <For each={gridLevels}>
            {(level) => {
              const points = STROKES.map((_, i) => {
                const angle = (Math.PI * 2 * i) / STROKES.length - Math.PI / 2;
                const actualR = radius() * level;
                return `${center() + actualR * Math.cos(angle)},${center() + actualR * Math.sin(angle)}`;
              }).join(' ');
              return (
                <polygon
                  points={points}
                  fill="none"
                  stroke="#374151"
                  stroke-width="1"
                  stroke-dasharray={level === 1 ? '0' : '4 4'}
                  opacity="0.5"
                />
              );
            }}
          </For>

          <For each={STROKES}>
            {(_, i) => {
              const angle = (Math.PI * 2 * i()) / STROKES.length - Math.PI / 2;
              return (
                <line
                  x1={center()}
                  y1={center()}
                  x2={center() + radius() * Math.cos(angle)}
                  y2={center() + radius() * Math.sin(angle)}
                  stroke="#374151"
                  stroke-width="1"
                  opacity="0.3"
                />
              );
            }}
          </For>

          <For each={allSwimmers()}>
            {(swimmer, swimmerIdx) => {
              const idx = swimmerIdx();
              const color = COMPARE_COLORS[idx];
              const points = getSwimmerPoints(idx);
              const strokeWidth = idx === 0 ? 3 : 2.5;

              return (
                <g class={`radar-swimmer-group swimmer-${idx}`}>
                  <polygon
                    points={points}
                    fill={`url(#${getSwimmerFillId(idx)})`}
                    stroke={color.main}
                    stroke-width={strokeWidth}
                    stroke-linejoin="round"
                    opacity={idx === 0 ? 1 : 0.85}
                  />
                  
                  <For each={STROKES}>
                    {(stroke, i) => {
                      const p = getPoint(i(), swimmer.pb[stroke], radius());
                      return (
                        <g>
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={idx === 0 ? 6 : 5}
                            fill={color.main}
                            stroke="#fff"
                            stroke-width="2"
                          />
                          <title>{`${swimmer.name} - ${stroke}: ${formatTime(swimmer.pb[stroke])}`}</title>
                        </g>
                      );
                    }}
                  </For>
                </g>
              );
            }}
          </For>

          <For each={STROKES}>
            {(stroke, i) => {
              const p = getLabelPoint(i());
              return (
                <g>
                  <text
                    x={p.x}
                    y={p.y - 10}
                    text-anchor="middle"
                    fill="#e5e7eb"
                    font-size="15"
                    font-weight="bold"
                  >
                    {stroke}
                  </text>
                  <text
                    x={p.x}
                    y={p.y + 10}
                    text-anchor="middle"
                    fill="#9ca3af"
                    font-size="12"
                  >
                    PB: {formatTime(props.swimmer.pb[stroke])}
                  </text>
                </g>
              );
            }}
          </For>

          <text x={center()} y={center() - 4} text-anchor="middle" fill="#6b7280" font-size="10">
            越快越好
          </text>
        </svg>
      </div>

      <div class="radar-legend">
        <For each={allSwimmers()}>
          {(swimmer, idx) => {
            const color = COMPARE_COLORS[idx()];
            return (
              <div class="legend-item">
                <span class="legend-color" style={{ background: color.main }} />
                <span>{swimmer.name}</span>
                {idx() === 0 && <span class="legend-badge">主</span>}
              </div>
            );
          }}
        </For>
      </div>

      {showSplitComparison() && (
        <div class="split-comparison-section">
          <h4 class="split-section-title">🏃 分段配速叠加对比</h4>
          <div class="split-comparison-chart">
            <div class="split-overlay-chart">
              <For each={allSplitTimes()}>
                {(splits, swimmerIdx) => {
                  const color = COMPARE_COLORS[swimmerIdx()];
                  const swimmerName = allSwimmers()[swimmerIdx()]?.name || `选手${swimmerIdx() + 1}`;
                  return (
                    <div class="split-overlay-row">
                      <div class="split-overlay-label" style={{ color: color.main }}>
                        {swimmerName}
                      </div>
                      <div class="split-overlay-bars">
                        <For each={splits}>
                          {(time, idx) => {
                            const prev = idx() > 0 ? splits[idx() - 1] : 0;
                            const interval = time - prev;
                            const heightPct = (interval / maxSplitInterval()) * 100;
                            return (
                              <div class="split-overlay-col">
                                <div 
                                  class="split-overlay-bar"
                                  style={{ 
                                    height: `${Math.max(heightPct, 15)}%`,
                                    background: color.main,
                                    'box-shadow': `0 0 8px ${color.main}40`,
                                    opacity: swimmerIdx() === 0 ? 1 : 0.7,
                                  }}
                                />
                                <span class="split-overlay-val">{formatTime(interval)}</span>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                      <div class="split-overlay-total" style={{ color: color.light }}>
                        {formatTime(splits[splits.length - 1])}
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
            <div class="split-distance-labels">
              {allSplitTimes().length > 0 && allSplitTimes()[0].map((_, idx) => (
                <span class="split-dist-label">{(idx + 1) * 50}m</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
