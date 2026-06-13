import { Component, createMemo, For } from 'solid-js';
import type { Swimmer, StrokeType } from '../types';
import { formatTime } from '../services/wsClient';

const STROKES: StrokeType[] = ['自由泳', '蛙泳', '蝶泳', '仰泳'];

interface Props {
  swimmer: Swimmer;
  compareSwimmer?: Swimmer;
  size?: number;
}

export const RadarChart: Component<Props> = (props) => {
  const size = () => props.size || 300;
  const center = () => size() / 2;
  const radius = () => size() * 0.38;

  const maxTime = 100;
  const minTime = 40;

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

  const points1 = createMemo(() => {
    return STROKES.map((stroke, i) => {
      const p = getPoint(i, props.swimmer.pb[stroke], radius());
      return `${p.x},${p.y}`;
    }).join(' ');
  });

  const points2 = createMemo(() => {
    if (!props.compareSwimmer) return '';
    return STROKES.map((stroke, i) => {
      const p = getPoint(i, props.compareSwimmer!.pb[stroke], radius());
      return `${p.x},${p.y}`;
    }).join(' ');
  });

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div class="radar-chart-container">
      <h3 class="chart-title">📊 四种泳姿 PB 成绩对比</h3>
      <div class="chart-wrapper">
        <svg width={size()} height={size()} viewBox={`0 0 ${size()} ${size()}`}>
          <defs>
            <radialGradient id="swimmer1Fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4" />
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.1" />
            </radialGradient>
            <radialGradient id="swimmer2Fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ef4444" stop-opacity="0.3" />
              <stop offset="100%" stop-color="#ef4444" stop-opacity="0.05" />
            </radialGradient>
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

          {props.compareSwimmer && (
            <>
              <polygon
                points={points2()}
                fill="url(#swimmer2Fill)"
                stroke="#ef4444"
                stroke-width="2.5"
                stroke-linejoin="round"
              />
              <For each={STROKES}>
                {(stroke, i) => {
                  const p = getPoint(i(), props.compareSwimmer!.pb[stroke], radius());
                  return (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="5"
                      fill="#ef4444"
                      stroke="#fff"
                      stroke-width="2"
                    />
                  );
                }}
              </For>
            </>
          )}

          <polygon
            points={points1()}
            fill="url(#swimmer1Fill)"
            stroke="#3b82f6"
            stroke-width="3"
            stroke-linejoin="round"
          />

          <For each={STROKES}>
            {(stroke, i) => {
              const p = getPoint(i(), props.swimmer.pb[stroke], radius());
              return (
                <g>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="6"
                    fill="#3b82f6"
                    stroke="#fff"
                    stroke-width="2"
                  />
                  <title>{`${stroke}: ${formatTime(props.swimmer.pb[stroke])}`}</title>
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
        <div class="legend-item">
          <span class="legend-color legend-blue" />
          <span>{props.swimmer.name}</span>
        </div>
        {props.compareSwimmer && (
          <div class="legend-item">
            <span class="legend-color legend-red" />
            <span>{props.compareSwimmer.name}</span>
          </div>
        )}
      </div>
    </div>
  );
};
