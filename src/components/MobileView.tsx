import { Component, createEffect, createSignal, For, onMount, onCleanup, createMemo, Show } from 'solid-js';
import {
  store,
  formatTime,
  formatDateTime,
  getFavoriteSwimmers,
  toggleFavoriteSwimmer,
  requestNotificationPermission,
  switchEvent,
  getCurrentEvent,
  getAllEvents,
  getConnectionQuality,
} from '../services/wsClient';
import type { Swimmer } from '../types';

interface Props {
  onSelectSwimmer: (swimmer: Swimmer) => void;
}

interface NotificationItem {
  id: string;
  swimmerName: string;
  eventName: string;
  rank: number;
  time: number;
  timestamp: number;
}

export const MobileView: Component<Props> = (props) => {
  const [activeTab, setActiveTab] = createSignal<'live' | 'favorites' | 'history'>('live');
  const [notifications, setNotifications] = createSignal<NotificationItem[]>([]);
  const [favorites, setFavorites] = createSignal<string[]>(getFavoriteSwimmers());
  const [transitionPhase, setTransitionPhase] = createSignal<'none' | 'out' | 'in'>('none');
  const [displayedEventId, setDisplayedEventId] = createSignal<string | null>(null);
  let transitionTimer: number | null = null;

  const currentEvent = createMemo(() => getCurrentEvent());
  const allEvents = createMemo(() => getAllEvents());
  const connectionQuality = createMemo(() => getConnectionQuality());

  const ongoingEvents = createMemo(() => 
    store.eventList.filter(e => e.status === 'ongoing')
  );

  const pendingEvents = createMemo(() =>
    store.eventList.filter(e => e.status === 'pending')
  );

  const displayEvent = createMemo(() => {
    const id = displayedEventId();
    if (id) return store.events.get(id) || currentEvent();
    return currentEvent();
  });

  const mobileQuickEvents = createMemo(() => {
    return [...ongoingEvents(), ...pendingEvents().slice(0, 2)];
  });

  const qualityLabel = createMemo(() => {
    switch (connectionQuality()) {
      case 'excellent': return '极佳';
      case 'good': return '良好';
      case 'poor': return '弱网';
      case 'offline': return '离线';
    }
  });

  const qualityClass = createMemo(() => {
    switch (connectionQuality()) {
      case 'excellent': return 'm-quality-excellent';
      case 'good': return 'm-quality-good';
      case 'poor': return 'm-quality-poor';
      case 'offline': return 'm-quality-offline';
    }
  });

  const handleEventSelect = (eventId: string) => {
    if (displayedEventId() === eventId) return;

    setTransitionPhase('out');
    const startTime = performance.now();
    const success = switchEvent(eventId);
    const endTime = performance.now();

    if (success) {
      if (transitionTimer) clearTimeout(transitionTimer);

      transitionTimer = window.setTimeout(() => {
        setDisplayedEventId(eventId);
        setTransitionPhase('in');

        transitionTimer = window.setTimeout(() => {
          setTransitionPhase('none');
        }, 200);
      }, 100);
    }

    if (endTime - startTime > 300) {
      console.warn(`[性能警告] 移动端项目切换耗时超过300ms: ${(endTime - startTime).toFixed(2)}ms`);
    }
  };

  onMount(() => {
    requestNotificationPermission();

    const handleSwimmerResult = (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail;

      const newNotif: NotificationItem = {
        id: `${data.eventId}-${data.swimmerId}-${Date.now()}`,
        swimmerName: data.swimmerName,
        eventName: currentEvent()?.name || '',
        rank: data.rank,
        time: data.time,
        timestamp: Date.now(),
      };

      setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
    };

    window.addEventListener('swimmer_result', handleSwimmerResult as EventListener);
    onCleanup(() => {
      window.removeEventListener('swimmer_result', handleSwimmerResult as EventListener);
      if (transitionTimer) clearTimeout(transitionTimer);
    });
  });

  createEffect(() => {
    setFavorites(getFavoriteSwimmers());
  });

  const favoriteSwimmersData = () => {
    const favIds = favorites();
    const swimmers: Swimmer[] = [];

    allEvents().forEach((event) => {
      event.lanes.forEach((lane) => {
        if (favIds.includes(lane.swimmerId) && !swimmers.find((s) => s.id === lane.swimmerId)) {
          swimmers.push(lane.swimmer);
        }
      });
    });

    return swimmers;
  };

  const getFavoriteLaneStatus = (swimmerId: string) => {
    const current = currentEvent();
    if (current) {
      const lane = current.lanes.find((l) => l.swimmerId === swimmerId);
      if (lane) {
        return {
          inCurrentEvent: true,
          lane,
          eventName: current.name,
        };
      }
    }

    let latestResult = null;
    const events = allEvents();
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const lane = event.lanes.find((l) => l.swimmerId === swimmerId);
      if (lane) {
        latestResult = { lane, eventName: event.name };
        break;
      }
    }

    return {
      inCurrentEvent: false,
      lane: latestResult?.lane || null,
      eventName: latestResult?.eventName || '暂无参赛',
    };
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'ongoing': return '🔴';
      case 'finished': return '✅';
      default: return '⏳';
    }
  };

  return (
    <div class="mobile-view">
      <header class="mobile-header">
        <h1>🏊 游泳锦标赛</h1>
        <div class="mobile-header-right">
          <span class={`m-quality-badge ${qualityClass()}`}>
            {qualityLabel()}
          </span>
          <span class={`conn-badge ${store.connected ? 'ok' : 'bad'}`}>
            {store.connected ? '●' : '○'}
          </span>
        </div>
      </header>

      {notifications().length > 0 && (
        <div class="notifications-banner">
          <div class="notif-scroll">
            <For each={notifications().slice(0, 3)}>
              {(notif) => (
                <div class="notif-item">
                  <span class="notif-rank">
                    {notif.rank === 1 ? '🥇' : notif.rank === 2 ? '🥈' : notif.rank === 3 ? '🥉' : `#${notif.rank}`}
                  </span>
                  <span class="notif-text">
                    <strong>{notif.swimmerName}</strong> 完赛！{formatTime(notif.time)}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      )}

      <div class="mobile-event-quick-switch">
        <div class="quick-switch-label">
          进行中 {ongoingEvents().length} / 待开始 {pendingEvents().length}
        </div>
        <div class="quick-switch-tabs">
          <For each={mobileQuickEvents()}>
            {(event) => (
              <button
                classList={{
                  'quick-switch-btn': true,
                  'active': (displayedEventId() || store.currentEventId) === event.id,
                  'ongoing': event.status === 'ongoing',
                }}
                onClick={() => handleEventSelect(event.id)}
              >
                <span class="quick-dot">{getStatusDot(event.status)}</span>
                <span class="quick-name">{event.name}</span>
                {event.status === 'ongoing' && <span class="breathing-dot"></span>}
              </button>
            )}
          </For>
        </div>
      </div>

      <nav class="mobile-tabs">
        <button
          class={`tab-btn ${activeTab() === 'live' ? 'active' : ''}`}
          onClick={() => setActiveTab('live')}
        >
          📺 直播
        </button>
        <button
          class={`tab-btn ${activeTab() === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          ⭐ 关注 ({favorites().length})
        </button>
        <button
          class={`tab-btn ${activeTab() === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📋 成绩
        </button>
      </nav>

      <div class="mobile-content">
        {activeTab() === 'live' && (
          <div class="live-section">
            <Show when={displayEvent()}>
              <div classList={{
                'live-event-card': true,
                'card-transition-out': transitionPhase() === 'out',
                'card-transition-in': transitionPhase() === 'in',
              }}>
                <div class="live-event-status live">
                  {displayEvent()!.status === 'ongoing' ? '🔴 直播中' : displayEvent()!.status === 'finished' ? '✅ 已结束' : '⏳ 即将开始'}
                </div>
                <h2>{displayEvent()!.name}</h2>
                <div class="live-event-time">
                  🕐 {formatDateTime(displayEvent()!.startTime)}
                </div>
              </div>

              <div classList={{
                'mobile-lanes': true,
                'lanes-transition-out': transitionPhase() === 'out',
                'lanes-transition-in': transitionPhase() === 'in',
              }}>
                <For each={displayEvent()!.lanes}>
                  {(lane) => (
                    <div
                      class={`mobile-lane-card ${lane.finished ? 'done' : ''} ${
                        favorites().includes(lane.swimmerId) ? 'fav' : ''
                      }`}
                      onClick={() => props.onSelectSwimmer(lane.swimmer)}
                    >
                      <div class="mobile-lane-head">
                        <span class="lane-num">{lane.laneNumber}</span>
                        <span class="lane-name">{lane.swimmer.name}</span>
                        <button
                          class={`mini-fav ${favorites().includes(lane.swimmerId) ? 'on' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteSwimmer(lane.swimmerId);
                            setFavorites(getFavoriteSwimmers());
                          }}
                        >
                          {favorites().includes(lane.swimmerId) ? '★' : '☆'}
                        </button>
                      </div>
                      <div class="mobile-progress-wrap">
                        <div class="mobile-progress-bar">
                          <div
                            class={`mobile-progress-fill ${lane.finished ? 'done' : ''}`}
                            style={{ width: `${lane.progress}%` }}
                          />
                        </div>
                      </div>
                      <div class="mobile-lane-foot">
                        <span class="lane-club">{lane.swimmer.club}</span>
                        <span class={`lane-time ${lane.finished ? 'final' : ''}`}>
                          {lane.rank && lane.rank <= 3
                            ? (lane.rank === 1 ? '🥇' : lane.rank === 2 ? '🥈' : '🥉') + ' '
                            : lane.rank ? `#${lane.rank} ` : ''}
                          {formatTime(lane.finished ? lane.finishTime : lane.currentTime)}
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <Show when={!displayEvent()}>
              <div class="empty-mobile">
                <div class="empty-icon">⏳</div>
                <p>暂无正在进行的比赛</p>
                <p class="empty-sub">请稍等，下一场比赛即将开始</p>
              </div>
            </Show>
          </div>
        )}

        {activeTab() === 'favorites' && (
          <div class="favorites-section">
            {favorites().length === 0 ? (
              <div class="empty-mobile">
                <div class="empty-icon">⭐</div>
                <p>还没有关注选手</p>
                <p class="empty-sub">在直播或成绩列表中点击 ☆ 收藏选手</p>
              </div>
            ) : (
              <For each={favoriteSwimmersData()}>
                {(swimmer) => {
                  const status = getFavoriteLaneStatus(swimmer.id);
                  return (
                    <div
                      class={`fav-card ${status.inCurrentEvent ? 'live' : ''}`}
                      onClick={() => props.onSelectSwimmer(swimmer)}
                    >
                      <div class="fav-card-head">
                        <div class="fav-avatar">{swimmer.name.charAt(0)}</div>
                        <div class="fav-info">
                          <div class="fav-name">
                            {swimmer.name}
                            {status.inCurrentEvent && <span class="fav-live-dot">●</span>}
                          </div>
                          <div class="fav-club">{swimmer.club}</div>
                          <div class="fav-event">{status.eventName}</div>
                        </div>
                        <button
                          class="mini-fav on"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteSwimmer(swimmer.id);
                            setFavorites(getFavoriteSwimmers());
                          }}
                        >
                          ★
                        </button>
                      </div>
                      {status.lane && (
                        <div class="fav-card-status">
                          {status.lane.finished ? (
                            <div class="fav-result">
                              <span class="fav-rank">
                                {status.lane.rank === 1
                                  ? '🥇'
                                  : status.lane.rank === 2
                                  ? '🥈'
                                  : status.lane.rank === 3
                                  ? '🥉'
                                  : `第${status.lane.rank}名`}
                              </span>
                              <span class="fav-time">{formatTime(status.lane.finishTime)}</span>
                            </div>
                          ) : (
                            <div class="fav-progress-mini">
                              <div class="fav-progress-bar">
                                <div
                                  class="fav-progress-fill"
                                  style={{ width: `${status.lane.progress}%` }}
                                />
                              </div>
                              <span class="fav-progress-time">
                                {formatTime(status.lane.currentTime)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }}
              </For>
            )}
          </div>
        )}

        {activeTab() === 'history' && (
          <div class="history-section">
            {allEvents().filter(e => e.status === 'finished').length === 0 ? (
              <div class="empty-mobile">
                <div class="empty-icon">📋</div>
                <p>暂无已结束的项目</p>
              </div>
            ) : (
              <For each={[...allEvents()].filter(e => e.status === 'finished').reverse()}>
                {(event) => (
                  <div class="history-event-card">
                    <div class="history-event-title">
                      {event.name}
                      <span class="history-event-time">
                        🕐 {formatDateTime(event.startTime)}
                      </span>
                    </div>
                    <div class="history-event-results">
                      <For
                        each={[...event.lanes].sort((a, b) => (a.rank || 999) - (b.rank || 999)).slice(0, 3)}
                      >
                        {(lane) => (
                          <div
                            class={`history-result rank-${lane.rank}`}
                            onClick={() => props.onSelectSwimmer(lane.swimmer)}
                          >
                            <span class="hist-rank">
                              {lane.rank === 1 ? '🥇' : lane.rank === 2 ? '🥈' : '🥉'}
                            </span>
                            <span class="hist-name">{lane.swimmer.name}</span>
                            <span class="hist-time">{formatTime(lane.finishTime)}</span>
                          </div>
                        )}
                      </For>
                    </div>
                    {event.lanes.length > 3 && (
                      <div class="history-more">
                        还有 {event.lanes.length - 3} 名选手
                      </div>
                    )}
                  </div>
                )}
              </For>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
