import { Component, createEffect, createSignal, onMount } from 'solid-js';
import { Show } from 'solid-js';
import { BigScreenView } from './components/BigScreenView';
import { EventsList } from './components/EventsList';
import { SwimmerDetail } from './components/SwimmerDetail';
import { MobileView } from './components/MobileView';
import { wsClient, applyCachedData, store } from './services/wsClient';
import type { Swimmer } from './types';

type ViewMode = 'big-screen' | 'events-list';

const App: Component = () => {
  const [viewMode, setViewMode] = createSignal<ViewMode>('big-screen');
  const [selectedSwimmer, setSelectedSwimmer] = createSignal<Swimmer | null>(null);
  const [isMobile, setIsMobile] = createSignal(false);

  onMount(() => {
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
    console.log('[App] 当前比赛:', store.currentEvent?.name || '无');
    console.log('[App] 已结束项目:', store.finishedEvents.length);
    console.log('[App] 连接状态:', store.connected ? '已连接' : '断开');
  });

  const handleSelectSwimmer = (swimmer: Swimmer) => {
    setSelectedSwimmer(swimmer);
  };

  return (
    <div class="app-container">
      <Show when={!store.connected && store.finishedEvents.length === 0 && !store.currentEvent}>
        <div class="offline-banner">
          ⚠️ 正在连接服务器... 已加载本地缓存数据
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
