import { Component } from 'solid-js';
import { formatTime, store, toggleFavoriteSwimmer, isFavoriteSwimmer } from '../services/wsClient';
import type { Swimmer } from '../types';

interface Props {
  onSelectSwimmer?: (swimmer: Swimmer) => void;
}

export const BigScreenView: Component<Props> = (props) => {
  const event = () => store.currentEvent;

  return (
    <div class="big-screen">
      <header class="event-header">
        <div class="event-title">
          <span class="event-badge">🏊 青少年游泳锦标赛</span>
          <h1 class="event-name">{event()?.name || '等待比赛开始...'}</h1>
          <span class={`event-status status-${event()?.status || 'pending'}`}>
            {event()?.status === 'ongoing' ? '⚡ 比赛进行中' : 
             event()?.status === 'finished' ? '✅ 比赛结束' : '⏳ 即将开始'}
          </span>
        </div>
        <div class="connection-status">
          <span class={store.connected ? 'connected' : 'disconnected'}>
            {store.connected ? '● 已连接' : '○ 连接中断 (本地缓存)'}
          </span>
        </div>
      </header>

      <div class="lanes-container">
        {event()?.lanes.map((lane) => (
          <div
            class={`lane-card ${lane.finished ? 'lane-finished' : ''} ${lane.rank === 1 ? 'lane-gold' : lane.rank === 2 ? 'lane-silver' : lane.rank === 3 ? 'lane-bronze' : ''}`}
          >
            <div class="lane-header">
              <div class="lane-number">{lane.laneNumber}</div>
              <div class="lane-swimmer-info">
                <div class="swimmer-name-row">
                  <span class="swimmer-name">{lane.swimmer.name}</span>
                  <button
                    class={`favorite-btn ${isFavoriteSwimmer(lane.swimmer.id) ? 'favorited' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteSwimmer(lane.swimmer.id);
                    }}
                  >
                    {isFavoriteSwimmer(lane.swimmer.id) ? '★' : '☆'}
                  </button>
                </div>
                <div class="swimmer-club">{lane.swimmer.club}</div>
              </div>
              {lane.rank && (
                <div class={`rank-badge rank-${lane.rank}`}>
                  {lane.rank === 1 ? '🥇' : lane.rank === 2 ? '🥈' : lane.rank === 3 ? '🥉' : `${lane.rank}`}
                </div>
              )}
            </div>

            <div class="progress-wrapper">
              <div class="progress-bar-bg">
                <div
                  class={`progress-bar ${lane.finished ? 'progress-done' : ''}`}
                  style={{ width: `${lane.progress}%` }}
                />
                <div class="progress-labels">
                  <span class="progress-start">起点</span>
                  <span class="progress-mid">50m</span>
                  <span class="progress-mid">100m</span>
                  <span class="progress-end">终点</span>
                </div>
              </div>
            </div>

            <div class="lane-footer">
              <div class="time-display">
                <span class="time-label">当前成绩</span>
                <span class={`time-value ${lane.finished ? 'time-final' : ''}`}>
                  {formatTime(lane.finished ? lane.finishTime : lane.currentTime)}
                </span>
              </div>
              {props.onSelectSwimmer && (
                <button
                  class="detail-btn"
                  onClick={() => props.onSelectSwimmer!(lane.swimmer)}
                >
                  详情
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {event() && event()!.replayMarkers.length > 0 && (
        <div class="replay-section">
          <div class="replay-title">📹 慢镜头回放点</div>
          <div class="replay-markers">
            {event()!.replayMarkers.map((marker, idx) => (
              <button
                class="replay-marker"
                onClick={() => {
                  console.log(`跳转到回放点: ${formatTime(marker)}`);
                  window.dispatchEvent(
                    new CustomEvent('replay_jump', { detail: { time: marker, index: idx } })
                  );
                }}
              >
                <span class="replay-index">#{idx + 1}</span>
                <span class="replay-time">{formatTime(marker)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {event()?.status === 'finished' && (
        <div class="final-ranking">
          <h2>🏆 最终排名</h2>
          <div class="ranking-table">
            {[...event()!.lanes]
              .sort((a, b) => (a.rank || 999) - (b.rank || 999))
              .map((lane) => (
                <div class={`ranking-row rank-${lane.rank}`}>
                  <span class="ranking-pos">{lane.rank}</span>
                  <span class="ranking-lane">道 {lane.laneNumber}</span>
                  <span class="ranking-name">{lane.swimmer.name}</span>
                  <span class="ranking-club">{lane.swimmer.club}</span>
                  <span class="ranking-time">{formatTime(lane.finishTime)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
