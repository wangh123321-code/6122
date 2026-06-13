export type StrokeType = '自由泳' | '蛙泳' | '蝶泳' | '仰泳';

export type AgeGroup = '少年甲组' | '少年乙组' | '儿童甲组' | '儿童乙组';

export type Gender = '男' | '女';

export type EventStatus = 'pending' | 'ongoing' | 'finished';

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
  type: 'event_start' | 'progress_update' | 'lane_finish' | 'event_finish' | 'sync' | 'ping' | 'pong';
  data: any;
  timestamp: number;
}

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
