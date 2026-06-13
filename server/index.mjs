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
const createEvent = () => {
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
    status: 'ongoing',
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
    startTime: Date.now(),
  };
};

let currentEvent = null;
const finishedEvents = [];

const sendToAll = (message) => {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
};

const startNewEvent = () => {
  if (currentEvent) {
    finishedEvents.push({ ...currentEvent, status: 'finished' });
  }
  currentEvent = createEvent();

  sendToAll({
    type: 'event_start',
    data: currentEvent,
    timestamp: Date.now(),
  });

  console.log(`开始比赛: ${currentEvent.name}`);
  startProgressSimulation();
};

let progressInterval = null;
let rankCounter = 0;

const startProgressSimulation = () => {
  rankCounter = 0;
  if (progressInterval) clearInterval(progressInterval);

  progressInterval = setInterval(() => {
    if (!currentEvent) return;

    let allFinished = true;

    currentEvent.lanes.forEach((lane) => {
      if (!lane.finished) {
        allFinished = false;
        lane.progress = Math.min(100, lane.progress + lane.baseSpeed * (1 + Math.random() * 0.3));
        lane.currentTime = (Date.now() - currentEvent.startTime) / 1000;

        if (lane.progress >= 100) {
          lane.finished = true;
          lane.progress = 100;
          lane.finishTime = lane.currentTime;
          rankCounter++;
          lane.rank = rankCounter;
          lane.splitTimes = generateSplitTimes(currentEvent.distance, lane.finishTime);
          currentEvent.replayMarkers.push((Date.now() - currentEvent.startTime) / 1000);

          sendToAll({
            type: 'lane_finish',
            data: {
              eventId: currentEvent.id,
              laneNumber: lane.laneNumber,
              time: lane.finishTime,
              rank: lane.rank,
              splitTimes: lane.splitTimes,
              swimmerId: lane.swimmerId,
              swimmerName: lane.swimmer.name,
            },
            timestamp: Date.now(),
          });

          console.log(`赛道 ${lane.laneNumber} 完赛: ${lane.swimmer.name} - ${lane.finishTime.toFixed(2)}s 排名 ${lane.rank}`);
        }
      }
    });

    sendToAll({
      type: 'progress_update',
      data: {
        eventId: currentEvent.id,
        lanes: currentEvent.lanes.map(l => ({
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
      clearInterval(progressInterval);
      currentEvent.status = 'finished';

      sendToAll({
        type: 'event_finish',
        data: {
          ...currentEvent,
          lanes: currentEvent.lanes.map(l => {
            const { baseSpeed, ...laneData } = l;
            return laneData;
          }),
        },
        timestamp: Date.now(),
      });

      console.log(`比赛结束: ${currentEvent.name}`);

      setTimeout(() => {
        startNewEvent();
      }, 5000);
    }
  }, 200);
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

  ws.send(JSON.stringify({
    type: 'sync',
    data: {
      currentEvent: currentEvent ? {
        ...currentEvent,
        lanes: currentEvent.lanes.map(l => {
          const { baseSpeed, ...laneData } = l;
          return laneData;
        }),
      } : null,
      finishedEvents: finishedEvents.map(e => ({
        ...e,
        lanes: e.lanes.map(l => {
          const { baseSpeed, ...laneData } = l;
          return laneData;
        }),
      })),
    },
    timestamp: Date.now(),
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (e) {
      console.error('消息解析错误:', e);
    }
  });

  ws.on('close', () => {
    console.log('客户端断开连接');
  });
});

setTimeout(() => {
  startNewEvent();
}, 1000);
