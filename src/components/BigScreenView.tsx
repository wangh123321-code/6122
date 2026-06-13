import { Component } from 'solid-js';
import { For } from 'solid-js';
import { formatTime, store, toggleFavoriteSwimmer, isFavoriteSwimmer } from '../services/wsClient';
import type { Swimmer } from '../types';

interface Props {
  onSelectSwimmer?: (swimmer: Swimmer) => void;
}

export const BigScreenView: Component<Props> = (props) => {
  return (
    <div class="big-screen">
      <header class="event-header">
        <div class="event-title">
          <span class="event-badge">🏊 青少年游泳锦标赛</span>
          <h1 class="event-name">{store.currentEvent?.name || '等待比赛开始...'}</h1>
          <span class={`event-status status-${store.currentEvent?.status || 'pending'}`}>
            {store.currentEvent?.status === 'ongoing' ? '⚡ 比赛进行中' : 
             store.currentEvent?.status === 'finished' ? '✅ 比赛结束' : '⏳ 即将开始'}
          </span>
        </div>
        <div class="connection-status">
          <span class={store.connected ? 'connected' : 'disconnected'}>
            {store.connected ? '● 已连接' : '○ 连接中断 (本地缓存)'}
          </span>
        </div>
      </header>

      <div class="lanes-container">
        <For each={store.currentEvent?.lanes || []}>
          {(lane) => (
            <div
              classList={{
                'lane-card': true,
                'lane-finished': lane.finished,
                'lane-gold': lane.rank === 1,
                'lane-silver': lane.rank === 2,
                'lane-bronze': lane.rank === 3,
              }}
            >
              <div class="lane-header">
                <div class="lane-number">{lane.laneNumber}</div>
                <div class="lane-swimmer-info">
                  <div class="swimmer-name-row">
                    <span class="swimmer-name">{lane.swimmer.name}</span>
                    <button
                      classList={{
                        'favorite-btn': true,
                        'favorited': isFavoriteSwimmer(lane.swimmer.id),
                      }}
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
                    classList={{
                      'progress-bar': true,
                      'progress-done': lane.finished,
                    }}
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
                  <span
                    classList={{
                      'time-value': true,
                      'time-final': lane.finished,
                    }}
                  >
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
          )}
        </For>
      </div>

      {store.currentEvent && store.currentEvent.replayMarkers.length > 0 && (
        <div class="replay-section">
          <div class="replay-title">📹 慢镜头回放点</div>
          <div class="replay-markers">
            <For each={store.currentEvent.replayMarkers}>
              {(marker, idx) => (
                <button
                  class="replay-marker"
                  onClick={() => {
                    console.log(`跳转到回放点: ${formatTime(marker)}`);
                    window.dispatchEvent(
                      new CustomEvent('replay_jump', { detail: { time: marker, index: idx() } })
                    );
                  }}
                >
                  <span class="replay-index">#{idx() + 1}</span>
                  <span class="replay-time">{formatTime(marker)}</span>
                </button>
              )}
            </For>
          </div>
        </div>
      )}

      {store.currentEvent?.status === 'finished' && (
        <div class="final-ranking">
          <h2>🏆 最终排名</h2>
          <div class="ranking-table">
            <For
              each={[...(store.currentEvent?.lanes || [])].sort(
                (a, b) => (a.rank || 999) - (b.rank || 999)
              )}
            >
              {(lane) => (
                <div class={`ranking-row rank-${lane.rank}`}>
                  <span class="ranking-pos">{lane.rank}</span>
                  <span class="ranking-lane">道 {lane.laneNumber}</span>
                  <span class="ranking-name">{lane.swimmer.name}</span>
                  <span class="ranking-club">{lane.swimmer.club}</span>
                  <span class="ranking-time">{formatTime(lane.finishTime)}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      )}
    </div>
  );
};
