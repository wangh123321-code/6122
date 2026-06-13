import { Component, For, createMemo, onMount, onCleanup } from 'solid-js';
import { createSignal } from 'solid-js';
import { store, switchEvent, formatDateTime } from '../services/wsClient';
import type { EventListItem } from '../types';

interface Props {
  onEventChange?: (eventId: string) => void;
}

export const ScheduleBar: Component<Props> = (props) => {
  const [isDragging, setIsDragging] = createSignal(false);
  const [startX, setStartX] = createSignal(0);
  const [scrollLeft, setScrollLeft] = createSignal(0);
  const [container, setContainer] = createSignal<HTMLDivElement | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ongoing': return '🔴';
      case 'finished': return '✅';
      default: return '⏳';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ongoing': return '进行中';
      case 'finished': return '已结束';
      default: return '未开始';
    }
  };

  const handleEventClick = (event: EventListItem) => {
    if (isDragging()) return;
    
    const startTime = performance.now();
    const success = switchEvent(event.id);
    const endTime = performance.now();

    if (success) {
      props.onEventChange?.(event.id);
      
      if (endTime - startTime > 300) {
        console.warn(`[性能警告] 项目切换耗时超过300ms: ${(endTime - startTime).toFixed(2)}ms`);
      }
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (container()?.offsetLeft || 0));
    setScrollLeft(container()?.scrollLeft || 0);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging() || !container()) return;
    e.preventDefault();
    const x = e.pageX - (container()?.offsetLeft || 0);
    const walk = (x - startX()) * 1.5;
    container()!.scrollLeft = scrollLeft() - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const scrollToOngoing = () => {
    if (!container()) return;
    const ongoingItem = container()?.querySelector('.schedule-item.ongoing');
    if (ongoingItem) {
      ongoingItem.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
  };

  const ongoingCount = createMemo(() => 
    store.eventList.filter(e => e.status === 'ongoing').length
  );

  const finishedCount = createMemo(() => 
    store.eventList.filter(e => e.status === 'finished').length
  );

  const pendingCount = createMemo(() => 
    store.eventList.filter(e => e.status === 'pending').length
  );

  onMount(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    
    setTimeout(() => {
      scrollToOngoing();
    }, 500);
  });

  onCleanup(() => {
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('mousemove', handleMouseMove);
  });

  return (
    <div class="schedule-bar-container">
      <div class="schedule-bar-header">
        <div class="schedule-bar-title">
          <span class="schedule-icon">📅</span>
          <span>今日赛程</span>
          <div class="schedule-stats">
            <span class="stat-item ongoing">
              <span class="stat-dot"></span>
              进行中 {ongoingCount()}
            </span>
            <span class="stat-item finished">
              <span class="stat-dot"></span>
              已结束 {finishedCount()}
            </span>
            <span class="stat-item pending">
              <span class="stat-dot"></span>
              未开始 {pendingCount()}
            </span>
          </div>
        </div>
        <button class="scroll-to-live-btn" onClick={scrollToOngoing}>
          🎯 跳转到进行中
        </button>
      </div>
      
      <div 
        ref={setContainer}
        class={`schedule-bar ${isDragging() ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
      >
        <div class="schedule-track">
          <For each={store.eventList}>
            {(event, index) => (
              <div
                classList={{
                  'schedule-item': true,
                  [event.status]: true,
                  'active': store.currentEventId === event.id,
                  'subscribed': store.subscribedEventIds.has(event.id),
                }}
                onClick={() => handleEventClick(event)}
              >
                <div class="schedule-item-header">
                  <span class="schedule-status-icon">{getStatusIcon(event.status)}</span>
                  <span class="schedule-status-text">{getStatusText(event.status)}</span>
                </div>
                
                <div class="schedule-item-name">{event.name}</div>
                
                <div class="schedule-item-time">
                  <span class="time-icon">🕐</span>
                  {formatDateTime(event.startTime)}
                </div>

                <div class="schedule-item-meta">
                  <span class="meta-tag">{event.gender}子</span>
                  <span class="meta-tag">{event.distance}米</span>
                  <span class="meta-tag">{event.stroke}</span>
                </div>

                {event.status === 'ongoing' && (
                  <div class="breathing-light"></div>
                )}

                {index() < store.eventList.length - 1 && (
                  <div class="schedule-connector"></div>
                )}
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="schedule-scroll-hint">
        <span>← 左右滑动查看更多项目 →</span>
      </div>
    </div>
  );
};
