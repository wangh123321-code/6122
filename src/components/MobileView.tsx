import { Component, createEffect, createSignal, For, onMount, onCleanup } from 'solid-js';
import {
  store,
  formatTime,
  getFavoriteSwimmers,
  toggleFavoriteSwimmer,
  requestNotificationPermission,
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

  onMount(() => {
    requestNotificationPermission();

    const handleSwimmerResult = (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail;

      const newNotif: NotificationItem = {
        id: `${data.eventId}-${data.swimmerId}-${Date.now()}`,
        swimmerName: data.swimmerName,
        eventName: store.currentEvent?.name || '',
        rank: data.rank,
        time: data.time,
        timestamp: Date.now(),
      };

      setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
    };

    window.addEventListener('swimmer_result', handleSwimmerResult as EventListener);
    onCleanup(() => {
      window.removeEventListener('swimmer_result', handleSwimmerResult as EventListener);
    });
  });

  createEffect(() => {
    setFavorites(getFavoriteSwimmers());
  });

  const favoriteSwimmersData = () => {
    const favIds = favorites();
    const swimmers: Swimmer[] = [];

    if (store.currentEvent) {
      store.currentEvent.lanes.forEach((lane) => {
        if (favIds.includes(lane.swimmerId)) {
          swimmers.push(lane.swimmer);
        }
      });
    }

    store.finishedEvents.forEach((event) => {
      event.lanes.forEach((lane) => {
        if (favIds.includes(lane.swimmerId) && !swimmers.find((s) => s.id === lane.swimmerId)) {
          swimmers.push(lane.swimmer);
        }
      });
    });

    return swimmers;
  };

  const getFavoriteLaneStatus = (swimmerId: string) => {
    if (store.currentEvent) {
      const lane = store.currentEvent.lanes.find((l) => l.swimmerId === swimmerId);
      if (lane) {
        return {
          inCurrentEvent: true,
          lane,
          eventName: store.currentEvent.name,
        };
      }
    }

    let latestResult = null;
    for (let i = store.finishedEvents.length - 1; i >= 0; i--) {
      const event = store.finishedEvents[i];
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

  return (
    <div class="mobile-view">
      <header class="mobile-header">
        <h1>🏊 游泳锦标赛</h1>
        <div class={`conn-badge ${store.connected ? 'ok' : 'bad'}`}>
          {store.connected ? '●' : '○'}
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
            {store.currentEvent ? (
              <>
                <div class="live-event-card">
                  <div class="live-event-status live">🔴 直播中</div>
                  <h2>{store.currentEvent.name}</h2>
                </div>
                <div class="mobile-lanes">
                  <For each={store.currentEvent.lanes}>
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
              </>
            ) : (
              <div class="empty-mobile">
                <div class="empty-icon">⏳</div>
                <p>暂无正在进行的比赛</p>
                <p class="empty-sub">请稍等，下一场比赛即将开始</p>
              </div>
            )}
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
            {store.finishedEvents.length === 0 ? (
              <div class="empty-mobile">
                <div class="empty-icon">📋</div>
                <p>暂无已结束的项目</p>
              </div>
            ) : (
              <For each={[...store.finishedEvents].reverse()}>
                {(event) => (
                  <div class="history-event-card">
                    <div class="history-event-title">{event.name}</div>
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
