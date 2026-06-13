import { Component, createMemo, For, createSignal } from 'solid-js';
import type { Swimmer } from '../types';
import { store, formatTime, toggleFavoriteSwimmer, isFavoriteSwimmer, getCurrentEvent, getAllEvents } from '../services/wsClient';
import { RadarChart } from './RadarChart';

interface Props {
  swimmer: Swimmer;
  onClose: () => void;
}

export const SwimmerDetail: Component<Props> = (props) => {
  const [compareSwimmerIds, setCompareSwimmerIds] = createSignal<string[]>([]);
  const [compareMode, setCompareMode] = createSignal(false);

  const allEvents = createMemo(() => getAllEvents());

  const swimmerEvents = createMemo(() => {
    const events: Array<{
      event: ReturnType<typeof getAllEvents>[0];
      lane: ReturnType<typeof getAllEvents>[0]['lanes'][0];
    }> = [];

    allEvents().forEach((event) => {
      const lane = event.lanes.find((l) => l.swimmerId === props.swimmer.id);
      if (lane) {
        events.push({ event, lane });
      }
    });

    return events.sort((a, b) => {
      if (a.event.startTime && b.event.startTime) {
        return b.event.startTime - a.event.startTime;
      }
      return 0;
    });
  });

  const currentEventLanes = createMemo(() => {
    const currentEvent = getCurrentEvent();
    if (!currentEvent) return [];
    return currentEvent.lanes;
  });

  const availableCompareSwimmers = createMemo(() => {
    const currentEvent = getCurrentEvent();
    if (!currentEvent) return [];
    
    return currentEvent.lanes
      .filter(lane => lane.swimmerId !== props.swimmer.id)
      .map(lane => lane.swimmer);
  });

  const compareSwimmers = createMemo(() => {
    return compareSwimmerIds()
      .map(id => availableCompareSwimmers().find(s => s.id === id))
      .filter(Boolean) as Swimmer[];
  });

  const toggleCompareSwimmer = (swimmerId: string) => {
    const current = compareSwimmerIds();
    if (current.includes(swimmerId)) {
      setCompareSwimmerIds(current.filter(id => id !== swimmerId));
    } else if (current.length < 3) {
      setCompareSwimmerIds([...current, swimmerId]);
    }
  };

  const currentEventSwimmerData = createMemo(() => {
    const currentEvent = getCurrentEvent();
    if (!currentEvent) return { mainSplits: [], compareSplits: [] };

    const mainLane = currentEvent.lanes.find(l => l.swimmerId === props.swimmer.id);
    const mainSplits = mainLane?.splitTimes || [];
    
    const compareSplits: number[][] = compareSwimmerIds()
      .map(id => {
        const lane = currentEvent.lanes.find(l => l.swimmerId === id);
        return lane?.splitTimes || [];
      })
      .filter(splits => splits.length > 0);

    return { mainSplits, compareSplits };
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
            <div class="radar-controls">
              <button
                classList={{
                  'compare-toggle-btn': true,
                  'active': compareMode(),
                }}
                onClick={() => setCompareMode(!compareMode())}
              >
                {compareMode() ? '✕ 退出对比' : '🔄 对比模式'}
              </button>
              <span class="compare-hint">
                已选 {compareSwimmerIds().length}/3 (共{1 + compareSwimmerIds().length}人对比)
              </span>
            </div>

            <RadarChart 
              swimmer={props.swimmer} 
              compareSwimmers={compareSwimmers()}
              size={320}
              showSplitComparison={currentEventSwimmerData().mainSplits.length > 0}
              splitTimes={currentEventSwimmerData().mainSplits}
              compareSplitTimes={currentEventSwimmerData().compareSplits}
            />

            {compareMode() && availableCompareSwimmers().length > 0 && (
              <div class="compare-selection">
                <h4 class="compare-title">选择对比选手 (最多3名，共4人对比)</h4>
                <div class="compare-swimmer-list">
                  <For each={availableCompareSwimmers()}>
                    {(swimmer) => (
                      <button
                        classList={{
                          'compare-swimmer-btn': true,
                          'selected': compareSwimmerIds().includes(swimmer.id),
                          'disabled': !compareSwimmerIds().includes(swimmer.id) && compareSwimmerIds().length >= 3,
                        }}
                        onClick={() => toggleCompareSwimmer(swimmer.id)}
                      >
                        <span class="compare-avatar">{swimmer.name.charAt(0)}</span>
                        <span class="compare-name">{swimmer.name}</span>
                        {compareSwimmerIds().includes(swimmer.id) && (
                          <span class="compare-check">✓</span>
                        )}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )}
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
