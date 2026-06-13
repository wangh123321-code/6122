import type { Swimmer, Event } from '../types';

const clubs = [
  '市游泳俱乐部',
  '海浪体育',
  '飞跃游泳学校',
  '蓝鲸训练中心',
  '水立方俱乐部',
  '海豚队',
  '翔宇青少年体育',
  '海星游泳队',
];

const firstNames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭'];
const lastNames = ['伟', '芳', '娜', '敏', '静', '强', '磊', '军', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀英'];

const generateSwimmers = (count: number, gender: '男' | '女', ageGroup: string): Swimmer[] => {
  const swimmers: Swimmer[] = [];
  for (let i = 0; i < count; i++) {
    const name = firstNames[Math.floor(Math.random() * firstNames.length)] + 
                 lastNames[Math.floor(Math.random() * lastNames.length)];
    swimmers.push({
      id: `${gender}-${ageGroup}-${i + 1}`,
      name,
      club: clubs[Math.floor(Math.random() * clubs.length)],
      gender,
      ageGroup: ageGroup as any,
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

export const allSwimmers: Swimmer[] = [
  ...generateSwimmers(16, '男', '少年甲组'),
  ...generateSwimmers(16, '女', '少年甲组'),
  ...generateSwimmers(16, '男', '少年乙组'),
  ...generateSwimmers(16, '女', '少年乙组'),
  ...generateSwimmers(16, '男', '儿童甲组'),
  ...generateSwimmers(16, '女', '儿童甲组'),
  ...generateSwimmers(16, '男', '儿童乙组'),
  ...generateSwimmers(16, '女', '儿童乙组'),
];

const strokes: Array<'自由泳' | '蛙泳' | '蝶泳' | '仰泳'> = ['自由泳', '蛙泳', '蝶泳', '仰泳'];
const distances = [50, 100, 200];
const ageGroups: Array<'少年甲组' | '少年乙组' | '儿童甲组' | '儿童乙组'> = ['少年甲组', '少年乙组', '儿童甲组', '儿童乙组'];
const genders: Array<'男' | '女'> = ['男', '女'];

let eventCounter = 0;
const createEvent = (stroke: string, distance: number, ageGroup: string, gender: string): Event => {
  eventCounter++;
  const filteredSwimmers = allSwimmers.filter(s => s.ageGroup === ageGroup && s.gender === gender);
  const selected = filteredSwimmers.slice(0, 8);
  
  return {
    id: `event-${eventCounter}`,
    name: `${ageGroup}${gender}子 ${distance}米${stroke}`,
    stroke: stroke as any,
    distance,
    ageGroup: ageGroup as any,
    gender: gender as any,
    status: 'pending',
    lanes: selected.map((swimmer, idx) => ({
      laneNumber: idx + 1,
      swimmerId: swimmer.id,
      swimmer,
      progress: 0,
      currentTime: 0,
      finished: false,
      finishTime: null,
      rank: null,
      splitTimes: [],
    })),
    replayMarkers: [],
    startTime: null,
  };
};

export const generateInitialEvents = (): Event[] => {
  const events: Event[] = [];
  strokes.forEach(stroke => {
    distances.forEach(distance => {
      ageGroups.forEach(ageGroup => {
        genders.forEach(gender => {
          events.push(createEvent(stroke, distance, ageGroup, gender));
        });
      });
    });
  });
  return events;
};
