import { Component, createMemo, For } from 'solid-js';
import type { Swimmer } from '../types';
import { store, formatTime, toggleFavoriteSwimmer, isFavoriteSwimmer } from '../services/wsClient';
import { RadarChart } from './RadarChart';

interface Props {
  swimmer: Swimmer;
  onClose: () => void;
}

export const SwimmerDetail: Component<Props> = (props) => {
  const swimmerEvents = createMemo(() => {
    const events: Array<{
      event: typeof store.finishedEvents[0];
      lane: typeof store.finishedEvents[0]['lanes'][0];
    }> = [];

    store.finishedEvents.forEach((event) => {
      const lane = event.lanes.find((l) => l.swimmerId === props.swimmer.id);
      if (lane) {
        events.push({ event, lane });
      }
    });

    if (store.currentEvent) {
      const lane = store.currentEvent.lanes.find((l) => l.swimmerId === props.swimmer.id);
      if (lane) {
        events.unshift({ event: store.currentEvent, lane });
      }
    }

    return events;
  });

  return (
    <div class="swimmer-detail-overlay" onClick={props.onClose}>
      <div class="swimmer-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button class="close-btn" onClick={props.onClose}>
          ✕
        </button>

        <div class="swimmer-detail-header">
          <div class="swimmer-avatar">
            {props.swimmer.name.charAt(0)}
          </div>
          <div class="swimmer-basic-info">
            <h2>
              {props.swimmer.name}
              <button
                class={`favorite-btn big ${isFavoriteSwimmer(props.swimmer.id) ? 'favorited' : ''}`}
                onClick={() => toggleFavoriteSwimmer(props.swimmer.id)}
              >
                {isFavoriteSwimmer(props.swimmer.id) ? '★ 已收藏' : '☆ 收藏'}
              </button>
            </h2>
            <div class="swimmer-meta">
              <span class="meta-tag">{props.swimmer.club}</span>
              <span class="meta-tag">{props.swimmer.gender}子</span>
              <span class="meta-tag">{props.swimmer.ageGroup}</span>
            </div>
          </div>
        </div>

        <div class="swimmer-detail-content">
          <div class="radar-section">
            <RadarChart swimmer={props.swimmer} size={320} />
          </div>

          <div class="events-section">
            <h3>🏅 参赛项目与分段计时</h3>
            {swimmerEvents().length === 0 ? (
              <div class="empty-state">暂无参赛记录</div>
            ) : (
              <div class="events-records">
                <For each={swimmerEvents()}>
                  {({ event, lane }) => (
                    <div class={`event-record status-${event.status}`}>
                      <div class="record-header">
                        <span class="event-record-name">{event.name}</span>
                        <span class={`event-record-status status-${event.status}`}>
                          {event.status === 'ongoing' ? '进行中' : '已结束'}
                        </span>
                        {lane.rank && (
                          <span class={`record-rank rank-${lane.rank}`}>
                            {lane.rank === 1 ? '🥇' : lane.rank === 2 ? '🥈' : lane.rank === 3 ? '🥉' : `第${lane.rank}名`}
                          </span>
                        )}
                      </div>
                      <div class="record-details">
                        <div class="record-detail-item">
                          <span class="detail-label">赛道</span>
                          <span class="detail-value">第 {lane.laneNumber} 道</span>
                        </div>
                        <div class="record-detail-item">
                          <span class="detail-label">总时间</span>
                          <span class="detail-value highlight">
                            {formatTime(lane.finished ? lane.finishTime : lane.currentTime)}
                          </span>
                        </div>
                        <div class="record-detail-item">
                          <span class="detail-label">距离</span>
                          <span class="detail-value">{event.distance} 米</span>
                        </div>
                        <div class="record-detail-item">
                          <span class="detail-label">泳姿</span>
                          <span class="detail-value">{event.stroke}</span>
                        </div>
                      </div>
                      {lane.splitTimes.length > 0 && (
                        <div class="split-times-section">
                          <div class="split-times-title">分段计时</div>
                          <div class="split-times-grid">
                            <For each={lane.splitTimes}>
                              {(time, idx) => {
                                const prev = idx() > 0 ? lane.splitTimes[idx() - 1] : 0;
                                const interval = time - prev;
                                return (
                                  <div class="split-time-card">
                                    <div class="split-label">{(idx() + 1) * 50}m</div>
                                    <div class="split-total">{formatTime(time)}</div>
                                    <div class="split-interval">+{formatTime(interval)}</div>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </For>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
