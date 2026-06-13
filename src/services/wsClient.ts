import { createStore, produce } from 'solid-js/store';
import type { Event, WSMessage, RaceResult, CacheState } from '../types';

const CACHE_KEY = 'swim_championship_cache';

export const formatTime = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '--';
  if (seconds < 0) return '--';
  const value = seconds;
  const mins = Math.floor(value / 60);
  const secs = (value % 60).toFixed(2);
  if (mins > 0) {
    return `${mins}:${secs.padStart(5, '0')}`;
  }
  return secs;
};

export const loadCache = (): CacheState | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('读取缓存失败:', e);
  }
  return null;
};

export const saveCache = (state: Partial<CacheState>) => {
  try {
    const existing = loadCache() || { events: [], results: [], lastSync: 0, pendingMessages: [] };
    const merged: CacheState = {
      events: state.events ?? existing.events,
      results: state.results ?? existing.results,
      lastSync: state.lastSync ?? existing.lastSync,
      pendingMessages: state.pendingMessages ?? existing.pendingMessages,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('保存缓存失败:', e);
  }
};

export const clearCache = () => {
  localStorage.removeItem(CACHE_KEY);
};

interface StoreState {
  currentEvent: Event | null;
  finishedEvents: Event[];
  results: RaceResult[];
  connected: boolean;
  lastError: string | null;
}

const initialState: StoreState = {
  currentEvent: null,
  finishedEvents: [],
  results: [],
  connected: false,
  lastError: null,
};

export const [store, setStore] = createStore<StoreState>(initialState);

export const applyCachedData = () => {
  const cache = loadCache();
  if (cache) {
    setStore({
      finishedEvents: cache.events.filter(e => e.status === 'finished'),
      results: cache.results,
    });
  }
};

class SwimWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private baseReconnectDelay = 1000;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private pendingMessages: WSMessage[] = [];
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket 连接成功');
        this.reconnectAttempts = 0;
        setStore('connected', true);
        setStore('lastError', null);
        this.flushPendingMessages();
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('消息解析错误:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket 错误:', error);
        setStore('lastError', '连接错误');
      };

      this.ws.onclose = () => {
        console.log('WebSocket 连接关闭');
        setStore('connected', false);
        this.stopPing();
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error('连接失败:', e);
      this.scheduleReconnect();
    }
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      setStore('lastError', '重连失败，请刷新页面');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000
    );
    this.reconnectAttempts++;

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  private handleMessage(message: WSMessage) {
    switch (message.type) {
      case 'sync':
        this.handleSync(message.data);
        break;
      case 'event_start':
        this.handleEventStart(message.data);
        break;
      case 'progress_update':
        this.handleProgressUpdate(message.data);
        break;
      case 'lane_finish':
        this.handleLaneFinish(message.data);
        break;
      case 'event_finish':
        this.handleEventFinish(message.data);
        break;
      case 'pong':
        break;
    }
  }

  private mergeEvents(localEvents: Event[], serverEvents: Event[]): Event[] {
    const merged = [...localEvents];
    serverEvents.forEach((serverEvent) => {
      const idx = merged.findIndex((e) => e.id === serverEvent.id);
      if (idx >= 0) {
        const localEvent = merged[idx];
        const mergedLanes = localEvent.lanes.map((localLane) => {
          const serverLane = serverEvent.lanes.find((l) => l.laneNumber === localLane.laneNumber);
          if (serverLane) {
            return {
              ...serverLane,
              progress: serverLane.finished ? 100 : Math.max(localLane.progress, serverLane.progress),
              currentTime: Math.max(localLane.currentTime, serverLane.currentTime),
              finishTime: localLane.finishTime || serverLane.finishTime,
              rank: localLane.rank || serverLane.rank,
              splitTimes: localLane.splitTimes.length > 0 ? localLane.splitTimes : serverLane.splitTimes,
              finished: localLane.finished || serverLane.finished,
            };
          }
          return localLane;
        });
        merged[idx] = {
          ...serverEvent,
          lanes: mergedLanes,
          replayMarkers: [
            ...new Set([...localEvent.replayMarkers, ...serverEvent.replayMarkers]),
          ].sort((a, b) => a - b),
        };
      } else {
        merged.push(serverEvent);
      }
    });
    return merged.sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime - b.startTime;
      return 0;
    });
  }

  private syncCurrentEventToFinished() {
    if (!store.currentEvent) return;
    const idx = store.finishedEvents.findIndex((e) => e.id === store.currentEvent!.id);
    if (idx >= 0) {
      setStore('finishedEvents', idx, { ...store.currentEvent });
    }
  }

  private handleSync(data: { currentEvent: Event | null; finishedEvents: Event[] }) {
    if (data.currentEvent) {
      setStore('currentEvent', data.currentEvent);
    }
    if (data.finishedEvents && data.finishedEvents.length > 0) {
      setStore('finishedEvents', (events) => {
        return this.mergeEvents(events, data.finishedEvents);
      });
    }
    this.syncCurrentEventToFinished();
    this.saveCurrentState();
  }

  private handleEventStart(event: Event) {
    setStore('currentEvent', event);
    this.syncCurrentEventToFinished();
    this.saveCurrentState();
  }

  private handleProgressUpdate(data: {
    eventId: string;
    lanes: Array<{
      laneNumber: number;
      progress: number;
      currentTime: number;
      finished: boolean;
      finishTime: number | null;
      rank: number | null;
    }>;
  }) {
    if (!store.currentEvent || store.currentEvent.id !== data.eventId) {
      const finishedIdx = store.finishedEvents.findIndex(e => e.id === data.eventId);
      if (finishedIdx >= 0) {
        setStore(
          'finishedEvents',
          finishedIdx,
          produce((event) => {
            if (!event) return;
            data.lanes.forEach((laneUpdate) => {
              const lane = event.lanes.find((l) => l.laneNumber === laneUpdate.laneNumber);
              if (lane && !lane.finished) {
                lane.progress = laneUpdate.progress;
                lane.currentTime = laneUpdate.currentTime;
                lane.finished = laneUpdate.finished;
                if (laneUpdate.finishTime) lane.finishTime = laneUpdate.finishTime;
                if (laneUpdate.rank) lane.rank = laneUpdate.rank;
              }
            });
          })
        );
      }
      return;
    }

    setStore(
      'currentEvent',
      produce((event) => {
        if (!event) return;
        data.lanes.forEach((laneUpdate) => {
          const lane = event.lanes.find((l) => l.laneNumber === laneUpdate.laneNumber);
          if (lane) {
            lane.progress = laneUpdate.progress;
            lane.currentTime = laneUpdate.currentTime;
            lane.finished = laneUpdate.finished;
            if (laneUpdate.finishTime) lane.finishTime = laneUpdate.finishTime;
            if (laneUpdate.rank) lane.rank = laneUpdate.rank;
          }
        });
      })
    );
    this.syncCurrentEventToFinished();
  }

  private handleLaneFinish(data: {
    eventId: string;
    laneNumber: number;
    time: number;
    rank: number;
    splitTimes: number[];
    swimmerId: string;
    swimmerName: string;
  }) {
    const targetEvent = store.currentEvent?.id === data.eventId
      ? store.currentEvent
      : store.finishedEvents.find(e => e.id === data.eventId) || null;

    if (!targetEvent) return;

    if (store.currentEvent?.id === data.eventId) {
      setStore(
        'currentEvent',
        produce((event) => {
          if (!event) return;
          const lane = event.lanes.find((l) => l.laneNumber === data.laneNumber);
          if (lane) {
            lane.finished = true;
            lane.finishTime = data.time;
            lane.rank = data.rank;
            lane.splitTimes = data.splitTimes;
            lane.progress = 100;
          }
          if (event.replayMarkers && !event.replayMarkers.includes(data.time)) {
            event.replayMarkers.push(data.time);
          }
        })
      );
    }

    const finishedIdx = store.finishedEvents.findIndex(e => e.id === data.eventId);
    if (finishedIdx >= 0) {
      setStore(
        'finishedEvents',
        finishedIdx,
        produce((event) => {
          if (!event) return;
          const lane = event.lanes.find((l) => l.laneNumber === data.laneNumber);
          if (lane) {
            lane.finished = true;
            lane.finishTime = data.time;
            lane.rank = data.rank;
            lane.splitTimes = data.splitTimes;
            lane.progress = 100;
          }
          if (event.replayMarkers && !event.replayMarkers.includes(data.time)) {
            event.replayMarkers.push(data.time);
          }
        })
      );
    }

    const result: RaceResult = {
      eventId: data.eventId,
      swimmerId: data.swimmerId,
      laneNumber: data.laneNumber,
      time: data.time,
      rank: data.rank,
      splitTimes: data.splitTimes,
      timestamp: Date.now(),
    };

    setStore('results', (results) => [...results, result]);
    this.syncCurrentEventToFinished();
    this.saveCurrentState();

    notifyFavoriteSwimmers(data.swimmerId, data);
  }

  private handleEventFinish(serverEvent: Event) {
    const mergedEvent = store.currentEvent && store.currentEvent.id === serverEvent.id
      ? { ...store.currentEvent, status: 'finished' as const }
      : serverEvent;

    setStore('finishedEvents', (events) => {
      const idx = events.findIndex((e) => e.id === mergedEvent.id);
      if (idx >= 0) {
        const newEvents = [...events];
        newEvents[idx] = mergedEvent;
        return newEvents;
      }
      return [...events, mergedEvent];
    });
    if (store.currentEvent?.id === mergedEvent.id) {
      setStore('currentEvent', null);
    }
    this.saveCurrentState();
  }

  private saveCurrentState() {
    const allEvents = [...store.finishedEvents];
    if (store.currentEvent) {
      const idx = allEvents.findIndex((e) => e.id === store.currentEvent!.id);
      if (idx >= 0) {
        allEvents[idx] = store.currentEvent;
      } else {
        allEvents.push(store.currentEvent);
      }
    }
    saveCache({
      events: allEvents,
      results: store.results,
      lastSync: Date.now(),
      pendingMessages: this.pendingMessages,
    });
  }

  private flushPendingMessages() {
    while (this.pendingMessages.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.pendingMessages.shift();
      if (msg) {
        this.ws.send(JSON.stringify(msg));
      }
    }
  }

  send(message: WSMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.pendingMessages.push(message);
      saveCache({ pendingMessages: this.pendingMessages });
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

const favoriteSwimmersKey = 'swim_favorites';

export const getFavoriteSwimmers = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(favoriteSwimmersKey) || '[]');
  } catch {
    return [];
  }
};

export const toggleFavoriteSwimmer = (swimmerId: string): boolean => {
  const favorites = getFavoriteSwimmers();
  const idx = favorites.indexOf(swimmerId);
  if (idx >= 0) {
    favorites.splice(idx, 1);
    localStorage.setItem(favoriteSwimmersKey, JSON.stringify(favorites));
    return false;
  } else {
    favorites.push(swimmerId);
    localStorage.setItem(favoriteSwimmersKey, JSON.stringify(favorites));
    return true;
  }
};

export const isFavoriteSwimmer = (swimmerId: string): boolean => {
  return getFavoriteSwimmers().includes(swimmerId);
};

const notifiedResultsKey = 'swim_notified_results';

const notifyFavoriteSwimmers = (swimmerId: string, data: any) => {
  const favorites = getFavoriteSwimmers();
  if (!favorites.includes(swimmerId)) return;

  try {
    const notified: string[] = JSON.parse(localStorage.getItem(notifiedResultsKey) || '[]');
    const resultKey = `${data.eventId}-${swimmerId}`;

    if (!notified.includes(resultKey)) {
      notified.push(resultKey);
      localStorage.setItem(notifiedResultsKey, JSON.stringify(notified));

      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(`🏊 ${data.swimmerName} 完赛！`, {
            body: `排名第 ${data.rank} 名，成绩 ${formatTime(data.time)}`,
            icon: '🏊',
          });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
      }

      window.dispatchEvent(
        new CustomEvent('swimmer_result', {
          detail: { swimmerId, ...data },
        })
      );
    }
  } catch (e) {
    console.error('通知失败:', e);
  }
};

export const requestNotificationPermission = () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
};

export const wsClient = new SwimWebSocketClient('ws://localhost:8080');
