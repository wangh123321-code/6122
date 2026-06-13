import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

console.log('WebSocket 服务器已启动，端口: 8080');

const clubs = [
  '市游泳俱乐部', '海浪体育', '飞跃游泳学校', '蓝鲸训练中心',
  '水立方俱乐部', '海豚队', '翔宇青少年体育', '海星游泳队',
];

const firstNames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭'];
const lastNames = ['伟', '芳', '娜', '敏', '静', '强', '磊', '军', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀英'];

const strokes = ['自由泳', '蛙泳', '蝶泳', '仰泳'];
const distances = [50, 100, 200];
const ageGroups = ['少年甲组', '少年乙组', '儿童甲组', '儿童乙组'];
const genders = ['男', '女'];

const MAX_PARALLEL_EVENTS = 3;
const TOTAL_EVENTS = 12;

let swimmerIdCounter = 0;
const generateSwimmers = (gender, ageGroup) => {
  const swimmers = [];
  for (let i = 0; i < 8; i++) {
    swimmerIdCounter++;
    swimmers.push({
      id: `swimmer-${swimmerIdCounter}`,
      name: firstNames[Math.floor(Math.random() * firstNames.length)] + lastNames[Math.floor(Math.random() * lastNames.length)],
      club: clubs[Math.floor(Math.random() * clubs.length)],
      gender,
      ageGroup,
      pb: {
        '自由泳': 50 + Math.random() * 30,
        '蛙泳': 60 + Math.random() * 30,
        '蝶泳': 55 + Math.random() * 30,
        '仰泳': 58 + Math.random() * 30,
      },
    });
  }
  return swimmers;
};

let eventIdCounter = 0;
const createEvent = (startOffset = 0) => {
  eventIdCounter++;
  const stroke = strokes[Math.floor(Math.random() * strokes.length)];
  const distance = distances[Math.floor(Math.random() * distances.length)];
  const ageGroup = ageGroups[Math.floor(Math.random() * ageGroups.length)];
  const gender = genders[Math.floor(Math.random() * genders.length)];
  const swimmers = generateSwimmers(gender, ageGroup);

  return {
    id: `event-${eventIdCounter}`,
    name: `${ageGroup}${gender}子 ${distance}米${stroke}`,
    stroke,
    distance,
    ageGroup,
    gender,
    status: 'pending',
    lanes: swimmers.map((swimmer, idx) => ({
      laneNumber: idx + 1,
      swimmerId: swimmer.id,
      swimmer,
      progress: 0,
      currentTime: 0,
      finished: false,
      finishTime: null,
      rank: null,
      splitTimes: [],
      baseSpeed: 0.8 + Math.random() * 0.4,
    })),
    replayMarkers: [],
    startTime: Date.now() + startOffset,
    lastUpdate: Date.now() + startOffset,
  };
};

const allEvents = [];
const pendingEvents = [];
const ongoingEvents = [];
const finishedEvents = [];

const generateSchedule = () => {
  let startOffset = 0;
  for (let i = 0; i < TOTAL_EVENTS; i++) {
    const event = createEvent(startOffset);
    allEvents.push(event);
    pendingEvents.push(event);
    startOffset += 30000 + Math.random() * 20000;
  }
  console.log(`已生成 ${TOTAL_EVENTS} 个赛事项目`);
};

generateSchedule();

const clientSubscriptions = new Map();

const sendToClient = (ws, message) => {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
};

const sendToSubscribers = (eventId, message) => {
  const data = JSON.stringify({ ...message, eventId });
  wss.clients.forEach((client) => {
    const subscriptions = clientSubscriptions.get(client);
    if (subscriptions && subscriptions.has(eventId) && client.readyState === 1) {
      client.send(data);
    }
  });
};

const broadcastEventListUpdate = () => {
  const eventList = allEvents.map(event => ({
    id: event.id,
    name: event.name,
    status: event.status,
    startTime: event.startTime,
    stroke: event.stroke,
    distance: event.distance,
    ageGroup: event.ageGroup,
    gender: event.gender,
  }));

  const message = JSON.stringify({
    type: 'event_list_update',
    data: { events: eventList },
    timestamp: Date.now(),
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
};

const stripBaseSpeed = (event) => {
  return {
    ...event,
    lanes: event.lanes.map(l => {
      const { baseSpeed, ...laneData } = l;
      return laneData;
    }),
  };
};

const getIncrementalData = (event, lastSync) => {
  if (!lastSync || event.lastUpdate > lastSync) {
    return {
      eventId: event.id,
      lanes: event.lanes.map(l => ({
        laneNumber: l.laneNumber,
        progress: l.progress,
        currentTime: l.currentTime,
        finished: l.finished,
        finishTime: l.finishTime,
        rank: l.rank,
      })),
      lastUpdate: event.lastUpdate,
    };
  }
  return null;
};

const handleSubscribe = (ws, data) => {
  const { eventId, lastSync } = data;
  let subscriptions = clientSubscriptions.get(ws);
  if (!subscriptions) {
    subscriptions = new Set();
    clientSubscriptions.set(ws, subscriptions);
  }
  subscriptions.add(eventId);
  console.log(`客户端订阅赛事: ${eventId}`);

  const event = allEvents.find(e => e.id === eventId);
  if (event) {
    const incrementalData = getIncrementalData(event, lastSync);
    if (incrementalData) {
      sendToClient(ws, {
        type: 'incremental_sync',
        eventId,
        data: incrementalData,
        timestamp: Date.now(),
      });
    }
    if (event.status !== 'pending') {
      sendToClient(ws, {
        type: 'sync',
        data: {
          events: [stripBaseSpeed(event)],
          currentEventId: eventId,
        },
        timestamp: Date.now(),
      });
    }
  }
};

const handleUnsubscribe = (ws, data) => {
  const { eventId } = data;
  const subscriptions = clientSubscriptions.get(ws);
  if (subscriptions) {
    subscriptions.delete(eventId);
    console.log(`客户端取消订阅赛事: ${eventId}`);
  }
};

const handleSubscribeBatch = (ws, data) => {
  const { eventIds, lastSync, eventSyncTimestamps } = data;
  let subscriptions = clientSubscriptions.get(ws);
  if (!subscriptions) {
    subscriptions = new Set();
    clientSubscriptions.set(ws, subscriptions);
  }
  
  const eventsToSync = [];
  const incrementalUpdates = [];

  eventIds.forEach(eventId => {
    subscriptions.add(eventId);
    const event = allEvents.find(e => e.id === eventId);
    if (event) {
      const perEventSync = eventSyncTimestamps?.[eventId] ?? lastSync ?? 0;
      const incrementalData = getIncrementalData(event, perEventSync);
      if (incrementalData) {
        incrementalUpdates.push(incrementalData);
      }
      if (event.status !== 'pending') {
        eventsToSync.push(stripBaseSpeed(event));
      }
    }
  });

  console.log(`客户端批量订阅 ${eventIds.length} 个赛事 (per-event增量同步)`);

  if (incrementalUpdates.length > 0) {
    sendToClient(ws, {
      type: 'batch_incremental_sync',
      data: { updates: incrementalUpdates },
      timestamp: Date.now(),
    });
  }

  if (eventsToSync.length > 0) {
    sendToClient(ws, {
      type: 'sync',
      data: {
        events: eventsToSync,
      },
      timestamp: Date.now(),
    });
  }
};

const startEvent = (event) => {
  event.status = 'ongoing';
  event.startTime = Date.now();
  event.lastUpdate = Date.now();
  
  const idx = pendingEvents.findIndex(e => e.id === event.id);
  if (idx >= 0) {
    pendingEvents.splice(idx, 1);
  }
  ongoingEvents.push(event);

  console.log(`开始比赛: ${event.name}`);
  
  sendToSubscribers(event.id, {
    type: 'event_start',
    data: stripBaseSpeed(event),
    timestamp: Date.now(),
  });

  broadcastEventListUpdate();
  startProgressSimulation(event);
};

const eventSimulations = new Map();

const startProgressSimulation = (event) => {
  let rankCounter = 0;

  const simulationInterval = setInterval(() => {
    if (event.status !== 'ongoing') {
      clearInterval(simulationInterval);
      eventSimulations.delete(event.id);
      return;
    }

    let allFinished = true;

    event.lanes.forEach((lane) => {
      if (!lane.finished) {
        allFinished = false;
        lane.progress = Math.min(100, lane.progress + lane.baseSpeed * (1 + Math.random() * 0.3));
        lane.currentTime = (Date.now() - event.startTime) / 1000;

        if (lane.progress >= 100) {
          lane.finished = true;
          lane.progress = 100;
          lane.finishTime = lane.currentTime;
          rankCounter++;
          lane.rank = rankCounter;
          lane.splitTimes = generateSplitTimes(event.distance, lane.finishTime);
          event.replayMarkers.push(lane.finishTime);
          event.lastUpdate = Date.now();

          sendToSubscribers(event.id, {
            type: 'lane_finish',
            data: {
              eventId: event.id,
              laneNumber: lane.laneNumber,
              time: lane.finishTime,
              rank: lane.rank,
              splitTimes: lane.splitTimes,
              swimmerId: lane.swimmerId,
              swimmerName: lane.swimmer.name,
            },
            timestamp: Date.now(),
          });

          console.log(`[${event.name}] 赛道 ${lane.laneNumber} 完赛: ${lane.swimmer.name} - ${lane.finishTime.toFixed(2)}s 排名 ${lane.rank}`);
        }
      }
    });

    event.lastUpdate = Date.now();

    sendToSubscribers(event.id, {
      type: 'progress_update',
      data: {
        eventId: event.id,
        lanes: event.lanes.map(l => ({
          laneNumber: l.laneNumber,
          progress: l.progress,
          currentTime: l.currentTime,
          finished: l.finished,
          finishTime: l.finishTime,
          rank: l.rank,
        })),
      },
      timestamp: Date.now(),
    });

    if (allFinished) {
      clearInterval(simulationInterval);
      eventSimulations.delete(event.id);
      event.status = 'finished';
      event.lastUpdate = Date.now();

      const ongoingIdx = ongoingEvents.findIndex(e => e.id === event.id);
      if (ongoingIdx >= 0) {
        ongoingEvents.splice(ongoingIdx, 1);
      }
      finishedEvents.push(event);

      sendToSubscribers(event.id, {
        type: 'event_finish',
        data: stripBaseSpeed(event),
        timestamp: Date.now(),
      });

      console.log(`比赛结束: ${event.name}`);
      broadcastEventListUpdate();

      setTimeout(() => {
        startNextEventIfNeeded();
      }, 2000);
    }
  }, 200);

  eventSimulations.set(event.id, simulationInterval);
};

const startNextEventIfNeeded = () => {
  while (ongoingEvents.length < MAX_PARALLEL_EVENTS && pendingEvents.length > 0) {
    const nextEvent = pendingEvents[0];
    startEvent(nextEvent);
  }
};

const generateSplitTimes = (distance, totalTime) => {
  const segments = distance / 50;
  const splits = [];
  let accumulated = 0;
  for (let i = 0; i < segments; i++) {
    const segmentRatio = 0.9 + Math.random() * 0.2;
    const split = (totalTime / segments) * segmentRatio;
    accumulated += split;
    splits.push(Math.min(accumulated, totalTime));
  }
  splits[splits.length - 1] = totalTime;
  return splits;
};

wss.on('connection', (ws) => {
  console.log('新客户端连接');
  clientSubscriptions.set(ws, new Set());

  const eventList = allEvents.map(event => ({
    id: event.id,
    name: event.name,
    status: event.status,
    startTime: event.startTime,
    stroke: event.stroke,
    distance: event.distance,
    ageGroup: event.ageGroup,
    gender: event.gender,
  }));

  sendToClient(ws, {
    type: 'event_list_update',
    data: { events: eventList },
    timestamp: Date.now(),
  });

  const ongoingEventsData = ongoingEvents.map(e => stripBaseSpeed(e));
  if (ongoingEventsData.length > 0) {
    sendToClient(ws, {
      type: 'sync',
      data: {
        events: ongoingEventsData,
        currentEventId: ongoingEventsData[0]?.id,
      },
      timestamp: Date.now(),
    });
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'ping':
          sendToClient(ws, { type: 'pong', timestamp: Date.now() });
          break;
        case 'subscribe':
          handleSubscribe(ws, data.data);
          break;
        case 'unsubscribe':
          handleUnsubscribe(ws, data.data);
          break;
        case 'subscribe_batch':
          handleSubscribeBatch(ws, data.data);
          break;
      }
    } catch (e) {
      console.error('消息解析错误:', e);
    }
  });

  ws.on('close', () => {
    console.log('客户端断开连接');
    clientSubscriptions.delete(ws);
  });
});

setTimeout(() => {
  startNextEventIfNeeded();
  
  setInterval(() => {
    startNextEventIfNeeded();
  }, 5000);
}, 1000);

setInterval(() => {
  broadcastEventListUpdate();
}, 10000);
