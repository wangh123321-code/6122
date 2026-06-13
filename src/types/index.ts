export type StrokeType = '自由泳' | '蛙泳' | '蝶泳' | '仰泳';

export type AgeGroup = '少年甲组' | '少年乙组' | '儿童甲组' | '儿童乙组';

export type Gender = '男' | '女';

export type EventStatus = 'pending' | 'ongoing' | 'finished';

export type WSMessageType = 
  | 'event_start' 
  | 'progress_update' 
  | 'lane_finish' 
  | 'event_finish' 
  | 'sync' 
  | 'ping' 
  | 'pong'
  | 'subscribe'
  | 'unsubscribe'
  | 'subscribe_batch'
  | 'incremental_sync'
  | 'batch_incremental_sync'
  | 'event_list_update';

export interface Swimmer {
  id: string;
  name: string;
  club: string;
  gender: Gender;
  ageGroup: AgeGroup;
  pb: Record<StrokeType, number | null>;
}

export interface Lane {
  laneNumber: number;
  swimmerId: string;
  swimmer: Swimmer;
  progress: number;
  currentTime: number;
  finished: boolean;
  finishTime: number | null;
  rank: number | null;
  splitTimes: number[];
}

export interface Event {
  id: string;
  name: string;
  stroke: StrokeType;
  distance: number;
  ageGroup: AgeGroup;
  gender: Gender;
  status: EventStatus;
  lanes: Lane[];
  replayMarkers: number[];
  startTime: number | null;
}

export interface RaceResult {
  eventId: string;
  swimmerId: string;
  laneNumber: number;
  time: number;
  rank: number;
  splitTimes: number[];
  timestamp: number;
}

export interface WSMessage {
  type: WSMessageType;
  eventId?: string;
  data: any;
  timestamp: number;
}

export interface SubscribeMessage extends WSMessage {
  type: 'subscribe';
  data: {
    eventId: string;
    lastSync?: number;
  };
}

export interface UnsubscribeMessage extends WSMessage {
  type: 'unsubscribe';
  data: {
    eventId: string;
  };
}

export interface SubscribeBatchMessage extends WSMessage {
  type: 'subscribe_batch';
  data: {
    eventIds: string[];
    lastSync?: number;
    eventSyncTimestamps?: Record<string, number>;
  };
}

export interface EventListItem {
  id: string;
  name: string;
  status: EventStatus;
  startTime: number | null;
  stroke: StrokeType;
  distance: number;
  ageGroup: AgeGroup;
  gender: Gender;
}

export interface IncrementalSyncData {
  eventId: string;
  lanes: Array<{
    laneNumber: number;
    progress: number;
    currentTime: number;
    finished: boolean;
    finishTime: number | null;
    rank: number | null;
  }>;
  lastUpdate: number;
}

export interface BatchIncrementalSyncData {
  updates: IncrementalSyncData[];
}

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'offline';

export interface CacheState {
  events: Event[];
  results: RaceResult[];
  lastSync: number;
  pendingMessages: WSMessage[];
}

export interface FavoriteSwimmer {
  id: string;
  notifiedResults: string[];
}
