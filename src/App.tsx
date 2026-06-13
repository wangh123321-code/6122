import { Component, createEffect, createSignal, onMount } from 'solid-js';
import { Show } from 'solid-js';
import { BigScreenView } from './components/BigScreenView';
import { EventsList } from './components/EventsList';
import { SwimmerDetail } from './components/SwimmerDetail';
import { MobileView } from './components/MobileView';
import { wsClient, applyCachedData, store, clearCache, getCurrentEvent, getAllEvents, getEventList, getConnectionQuality } from './services/wsClient';
import type { Swimmer } from './types';

type ViewMode = 'big-screen' | 'events-list';

const CACHE_VERSION_KEY = 'swim_cache_version';
const CURRENT_CACHE_VERSION = 4;

const App: Component = () => {
  const [viewMode, setViewMode] = createSignal<ViewMode>('big-screen');
  const [selectedSwimmer, setSelectedSwimmer] = createSignal<Swimmer | null>(null);
  const [isMobile, setIsMobile] = createSignal(false);

  onMount(() => {
    try {
      const cachedVersion = parseInt(localStorage.getItem(CACHE_VERSION_KEY) || '0', 10);
      if (cachedVersion < CURRENT_CACHE_VERSION) {
        clearCache();
        localStorage.setItem(CACHE_VERSION_KEY, String(CURRENT_CACHE_VERSION));
      }
    } catch {
      clearCache();
    }
    applyCachedData();
    wsClient.connect();

    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    window.addEventListener('replay_jump', ((e: CustomEvent) => {
      console.log('跳转回放:', e.detail);
    }) as EventListener);
  });

  createEffect(() => {
    const eventList = getEventList();
    if (eventList.length > 0 && store.connected && store.subscribedEventIds.size === 0) {
      const allEventIds = eventList.map(e => e.id);
      console.log(`[App] 自动订阅全部 ${allEventIds.length} 个赛事项目 (单连接多路复用)`);
      wsClient.subscribeBatch(allEventIds);
    }
  });

  createEffect(() => {
    const current = getCurrentEvent();
    const all = getAllEvents();
    const ongoingCount = all.filter(e => e.status === 'ongoing').length;
    const finishedCount = all.filter(e => e.status === 'finished').length;
    const quality = getConnectionQuality();
    
    console.log('[App] 当前比赛:', current?.name || '无');
    console.log(`[App] 赛事状态: 进行中 ${ongoingCount} / 已结束 ${finishedCount} / 总数 ${all.length}`);
    console.log('[App] 连接状态:', store.connected ? '已连接' : '断开', '| 质量:', quality, '| 延迟:', `${Math.round(store.latency)}ms`);
    console.log('[App] 已订阅项目数:', store.subscribedEventIds.size);
  });

  const handleSelectSwimmer = (swimmer: Swimmer) => {
    setSelectedSwimmer(swimmer);
  };

  return (
    <div class="app-container">
      <Show when={!store.connected && store.events.size === 0}>
        <div class="offline-banner">
          ⚠️ 正在连接服务器... 已加载本地缓存数据
        </div>
      </Show>

      <Show when={store.connected && store.connectionQuality === 'poor'}>
        <div class="weak-network-banner">
          ⚠️ 网络信号较弱 (延迟 {Math.round(store.latency)}ms)，数据可能延迟
        </div>
      </Show>

      <Show when={isMobile()}>
        <MobileView onSelectSwimmer={handleSelectSwimmer} />
      </Show>

      <Show when={!isMobile()}>
        <div class="view-switcher">
          <button
            class={viewMode() === 'big-screen' ? 'active' : ''}
            onClick={() => setViewMode('big-screen')}
          >
            📺 大屏
          </button>
          <button
            class={viewMode() === 'events-list' ? 'active' : ''}
            onClick={() => setViewMode('events-list')}
          >
            📋 成绩
          </button>
        </div>

        <Show when={viewMode() === 'big-screen'}>
          <BigScreenView onSelectSwimmer={handleSelectSwimmer} />
        </Show>

        <Show when={viewMode() === 'events-list'}>
          <EventsList onSelectSwimmer={handleSelectSwimmer} />
        </Show>
      </Show>

      <Show when={selectedSwimmer()}>
        <SwimmerDetail
          swimmer={selectedSwimmer()!}
          onClose={() => setSelectedSwimmer(null)}
        />
      </Show>
    </div>
  );
};

export default App;
