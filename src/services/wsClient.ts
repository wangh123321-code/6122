import { createStore, produce } from 'solid-js/store';
import type { 
  Event, WSMessage, RaceResult, CacheState, 
  EventListItem, IncrementalSyncData, WSMessageType,
  BatchIncrementalSyncData, ConnectionQuality
} from '../types';

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

export const formatDateTime = (timestamp: number | null): string => {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
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
  events: Map<string, Event>;
  eventList: EventListItem[];
  currentEventId: string | null;
  results: RaceResult[];
  connected: boolean;
  lastError: string | null;
  subscribedEventIds: Set<string>;
  lastSyncTimestamps: Map<string, number>;
  connectionQuality: ConnectionQuality;
  latency: number;
}

const initialState: StoreState = {
  events: new Map(),
  eventList: [],
  currentEventId: null,
  results: [],
  connected: false,
  lastError: null,
  subscribedEventIds: new Set(),
  lastSyncTimestamps: new Map(),
  connectionQuality: 'offline',
  latency: 0,
};

export const [store, setStore] = createStore<StoreState>(initialState);

export const getCurrentEvent = (): Event | null => {
  if (!store.currentEventId) return null;
  return store.events.get(store.currentEventId) || null;
};

export const getEvent = (eventId: string): Event | null => {
  return store.events.get(eventId) || null;
};

export const getAllEvents = (): Event[] => {
  return Array.from(store.events.values());
};

export const getEventList = (): EventListItem[] => {
  return store.eventList;
};

export const getConnectionQuality = (): ConnectionQuality => {
  return store.connectionQuality;
};

export const switchEvent = (eventId: string): boolean => {
  const event = store.events.get(eventId);
  if (!event) return false;

  if (store.currentEventId === eventId) return true;

  const startTime = performance.now();
  setStore('currentEventId', eventId);
  const endTime = performance.now();

  console.log(`[切换项目] ${event.name} 耗时: ${(endTime - startTime).toFixed(2)}ms`);
  return true;
};

export const applyCachedData = () => {
  const cache = loadCache();
  if (cache) {
    const eventsMap = new Map<string, Event>();
    cache.events.forEach(event => {
      eventsMap.set(event.id, event);
    });

    const eventList: EventListItem[] = cache.events.map(event => ({
      id: event.id,
      name: event.name,
      status: event.status,
      startTime: event.startTime,
      stroke: event.stroke,
      distance: event.distance,
      ageGroup: event.ageGroup,
      gender: event.gender,
    }));

    setStore({
      events: eventsMap,
      eventList,
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
  private messageQueue: WSMessage[] = [];
  private processingQueue = false;
  private lastPingSent = 0;
  private latencyHistory: number[] = [];
  private maxLatencyHistory = 10;
  private connectionDroppedAt = 0;
  private qualityCheckTimer: number | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket 已连接，无需重复连接');
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket 连接成功 (单连接多路复用模式)');
        this.reconnectAttempts = 0;
        setStore('connected', true);
        setStore('connectionQuality', 'good');
        setStore('lastError', null);
        this.flushPendingMessages();
        this.startPing();
        this.startQualityCheck();

        if (this.connectionDroppedAt > 0) {
          this.resubscribeWithIncrementalSync();
          this.connectionDroppedAt = 0;
        } else {
          this.resubscribeAll();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.queueMessage(message);
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
        this.connectionDroppedAt = Date.now();
        setStore('connected', false);
        setStore('connectionQuality', 'offline');
        this.stopPing();
        this.stopQualityCheck();
        this.scheduleReconnect();
      };
    } catch (e) {
      console.error('连接失败:', e);
      this.scheduleReconnect();
    }
  }

  private queueMessage(message: WSMessage) {
    this.messageQueue.push(message);
    this.processMessageQueue();
  }

  private async processMessageQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      const startTime = performance.now();
      this.handleMessage(message);
      const endTime = performance.now();
      if (endTime - startTime > 16) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.processingQueue = false;
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSent = Date.now();
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: this.lastPingSent }));
      }
    }, 15000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private startQualityCheck() {
    this.stopQualityCheck();
    this.qualityCheckTimer = window.setInterval(() => {
      this.updateConnectionQuality();
    }, 5000);
  }

  private stopQualityCheck() {
    if (this.qualityCheckTimer) {
      clearInterval(this.qualityCheckTimer);
      this.qualityCheckTimer = null;
    }
  }

  private updateConnectionQuality() {
    const avgLatency = this.getAverageLatency();
    setStore('latency', avgLatency);

    if (!store.connected) {
      setStore('connectionQuality', 'offline');
    } else if (avgLatency < 100) {
      setStore('connectionQuality', 'excellent');
    } else if (avgLatency < 300) {
      setStore('connectionQuality', 'good');
    } else {
      setStore('connectionQuality', 'poor');
    }
  }

  private getAverageLatency(): number {
    if (this.latencyHistory.length === 0) return 0;
    return this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
  }

  private recordLatency(ms: number) {
    this.latencyHistory.push(ms);
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
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

  private resubscribeAll() {
    const subscribedIds = Array.from(store.subscribedEventIds);
    if (subscribedIds.length > 0) {
      console.log(`重新订阅 ${subscribedIds.length} 个项目:`, subscribedIds);
      this.subscribeBatch(subscribedIds);
    }
  }

  private resubscribeWithIncrementalSync() {
    const subscribedIds = Array.from(store.subscribedEventIds);
    if (subscribedIds.length === 0) return;

    const eventSyncTimestamps: Record<string, number> = {};
    subscribedIds.forEach(id => {
      const ts = store.lastSyncTimestamps.get(id);
      if (ts) {
        eventSyncTimestamps[id] = ts;
      }
    });

    console.log(`[增量重连] 重新订阅 ${subscribedIds.length} 个项目，携带 per-event 同步时间戳`);
    this.send({
      type: 'subscribe_batch',
      data: {
        eventIds: subscribedIds,
        eventSyncTimestamps,
      },
      timestamp: Date.now(),
    });
  }

  subscribe(eventId: string, lastSync?: number) {
    const lastSyncTime = lastSync ?? store.lastSyncTimestamps.get(eventId) ?? 0;

    setStore('subscribedEventIds', produce((set) => {
      set.add(eventId);
    }));

    this.send({
      type: 'subscribe',
      eventId,
      data: {
        eventId,
        lastSync: lastSyncTime,
      },
      timestamp: Date.now(),
    });
  }

  unsubscribe(eventId: string) {
    setStore('subscribedEventIds', produce((set) => {
      set.delete(eventId);
    }));

    this.send({
      type: 'unsubscribe',
      eventId,
      data: { eventId },
      timestamp: Date.now(),
    });
  }

  subscribeBatch(eventIds: string[], lastSync?: number) {
    const eventSyncTimestamps: Record<string, number> = {};
    eventIds.forEach(id => {
      const ts = store.lastSyncTimestamps.get(id);
      if (ts) {
        eventSyncTimestamps[id] = ts;
      }
    });

    eventIds.forEach(id => {
      setStore('subscribedEventIds', produce((set) => {
        set.add(id);
      }));
    });

    this.send({
      type: 'subscribe_batch',
      data: {
        eventIds,
        lastSync: lastSync ?? 0,
        eventSyncTimestamps: Object.keys(eventSyncTimestamps).length > 0
          ? eventSyncTimestamps
          : undefined,
      },
      timestamp: Date.now(),
    });
  }

  private handleMessage(message: WSMessage) {
    const type = message.type as WSMessageType;

    if (message.eventId) {
      (setStore as any)('lastSyncTimestamps', message.eventId, message.timestamp);
    }

    switch (type) {
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
      case 'event_list_update':
        this.handleEventListUpdate(message.data);
        break;
      case 'incremental_sync':
        this.handleIncrementalSync(message.data);
        break;
      case 'batch_incremental_sync':
        this.handleBatchIncrementalSync(message.data);
        break;
      case 'pong':
        this.handlePong(message);
        break;
    }
  }

  private handlePong(message: WSMessage) {
    if (message.timestamp && this.lastPingSent) {
      const latency = Date.now() - this.lastPingSent;
      this.recordLatency(latency);
    }
  }

  private mergeEvents(localEvents: Map<string, Event>, serverEvents: Event[]): Map<string, Event> {
    const merged = new Map(localEvents);
    serverEvents.forEach((serverEvent) => {
      const localEvent = merged.get(serverEvent.id);
      if (localEvent) {
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
        merged.set(serverEvent.id, {
          ...serverEvent,
          lanes: mergedLanes,
          replayMarkers: [
            ...new Set([...localEvent.replayMarkers, ...serverEvent.replayMarkers]),
          ].sort((a, b) => a - b),
        });
      } else {
        merged.set(serverEvent.id, serverEvent);
      }
    });
    return merged;
  }

  private updateEventList(events: Event[]) {
    const eventList: EventListItem[] = events.map(event => ({
      id: event.id,
      name: event.name,
      status: event.status,
      startTime: event.startTime,
      stroke: event.stroke,
      distance: event.distance,
      ageGroup: event.ageGroup,
      gender: event.gender,
    })).sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime - b.startTime;
      return 0;
    });
    setStore('eventList', eventList);
  }

  private handleSync(data: { events: Event[]; currentEventId?: string }) {
    if (data.events && data.events.length > 0) {
      const merged = this.mergeEvents(store.events, data.events);
      setStore('events', merged);
      this.updateEventList(Array.from(merged.values()));
    }
    if (data.currentEventId && !store.currentEventId) {
      setStore('currentEventId', data.currentEventId);
    }
    this.saveCurrentState();
  }

  private handleEventStart(event: Event) {
    setStore('events', produce((events) => {
      events.set(event.id, event);
    }));

    if (!store.currentEventId) {
      setStore('currentEventId', event.id);
    }

    this.updateEventList(Array.from(store.events.values()));
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
    const event = store.events.get(data.eventId);
    if (!event) return;

    (setStore as any)('events', data.eventId, produce((e: any) => {
      if (!e) return;
      data.lanes.forEach((laneUpdate) => {
        const lane = e.lanes.find((l: any) => l.laneNumber === laneUpdate.laneNumber);
        if (lane) {
          lane.progress = laneUpdate.progress;
          lane.currentTime = laneUpdate.currentTime;
          lane.finished = laneUpdate.finished;
          if (laneUpdate.finishTime) lane.finishTime = laneUpdate.finishTime;
          if (laneUpdate.rank) lane.rank = laneUpdate.rank;
        }
      });
    }));
  }

  private handleIncrementalSync(data: IncrementalSyncData) {
    this.handleProgressUpdate(data);
  }

  private handleBatchIncrementalSync(data: BatchIncrementalSyncData) {
    if (data.updates && Array.isArray(data.updates)) {
      data.updates.forEach(update => {
        this.handleProgressUpdate(update);
        if (update.eventId) {
          (setStore as any)('lastSyncTimestamps', update.eventId, update.lastUpdate);
        }
      });
    }
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
    const event = store.events.get(data.eventId);
    if (!event) return;

    (setStore as any)('events', data.eventId, produce((e: any) => {
      if (!e) return;
      const lane = e.lanes.find((l: any) => l.laneNumber === data.laneNumber);
      if (lane) {
        lane.finished = true;
        lane.finishTime = data.time;
        lane.rank = data.rank;
        lane.splitTimes = data.splitTimes;
        lane.progress = 100;
      }
      if (e.replayMarkers && !e.replayMarkers.includes(data.time)) {
        e.replayMarkers.push(data.time);
      }
    }));

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
    this.saveCurrentState();
    this.notifyFavoriteSwimmers(data.swimmerId, data);
  }

  private handleEventFinish(serverEvent: Event) {
    const localEvent = store.events.get(serverEvent.id);
    const mergedEvent = localEvent
      ? { ...localEvent, status: 'finished' as const }
      : serverEvent;

    setStore('events', produce((events) => {
      events.set(serverEvent.id, mergedEvent);
    }));

    this.updateEventList(Array.from(store.events.values()));

    if (store.currentEventId === serverEvent.id) {
      const ongoingEvent = Array.from(store.events.values()).find(e => e.status === 'ongoing');
      if (ongoingEvent) {
        setStore('currentEventId', ongoingEvent.id);
      }
    }
    this.saveCurrentState();
  }

  private handleEventListUpdate(data: { events: EventListItem[] }) {
    setStore('eventList', data.events.sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime - b.startTime;
      return 0;
    }));
  }

  private saveCurrentState() {
    const allEvents = Array.from(store.events.values());
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
    this.stopQualityCheck();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private notifyFavoriteSwimmers = (swimmerId: string, data: any) => {
    const favorites = getFavoriteSwimmers();
    if (!favorites.includes(swimmerId)) return;

    try {
      const notified: string[] = JSON.parse(localStorage.getItem('swim_notified_results') || '[]');
      const resultKey = `${data.eventId}-${swimmerId}`;

      if (!notified.includes(resultKey)) {
        notified.push(resultKey);
        localStorage.setItem('swim_notified_results', JSON.stringify(notified));

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

export const requestNotificationPermission = () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
};

export const wsClient = new SwimWebSocketClient('ws://localhost:8080');
