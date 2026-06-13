import { Component, createMemo, createSignal, For } from 'solid-js';
import { store, formatTime, toggleFavoriteSwimmer, isFavoriteSwimmer, getAllEvents } from '../services/wsClient';
import type { Swimmer, AgeGroup, StrokeType, Gender, Event } from '../types';

interface Props {
  onSelectSwimmer: (swimmer: Swimmer) => void;
}

const AGE_GROUPS: (AgeGroup | '全部')[] = ['全部', '少年甲组', '少年乙组', '儿童甲组', '儿童乙组'];
const STROKES: (StrokeType | '全部')[] = ['全部', '自由泳', '蛙泳', '蝶泳', '仰泳'];
const GENDERS: (Gender | '全部')[] = ['全部', '男', '女'];

export const EventsList: Component<Props> = (props) => {
  const [selectedAgeGroup, setSelectedAgeGroup] = createSignal<AgeGroup | '全部'>('全部');
  const [selectedStroke, setSelectedStroke] = createSignal<StrokeType | '全部'>('全部');
  const [selectedGender, setSelectedGender] = createSignal<Gender | '全部'>('全部');
  const [selectedEvent, setSelectedEvent] = createSignal<Event | null>(null);

  const filteredEvents = createMemo(() => {
    return getAllEvents().filter((event) => {
      if (event.status !== 'finished') return false;
      if (selectedAgeGroup() !== '全部' && event.ageGroup !== selectedAgeGroup()) return false;
      if (selectedStroke() !== '全部' && event.stroke !== selectedStroke()) return false;
      if (selectedGender() !== '全部' && event.gender !== selectedGender()) return false;
      return true;
    });
  });

  const handleEventClick = (event: Event) => {
    setSelectedEvent(event);
  };

  return (
    <div class="events-list">
      <div class="events-header">
        <h2>📋 已结束项目</h2>
        <div class="filter-group">
          <div class="filter-item">
            <label>组别:</label>
            <select
              value={selectedAgeGroup()}
              onChange={(e) => setSelectedAgeGroup(e.target.value as any)}
            >
              <For each={AGE_GROUPS}>{(g) => <option value={g}>{g}</option>}</For>
            </select>
          </div>
          <div class="filter-item">
            <label>泳姿:</label>
            <select
              value={selectedStroke()}
              onChange={(e) => setSelectedStroke(e.target.value as any)}
            >
              <For each={STROKES}>{(s) => <option value={s}>{s}</option>}</For>
            </select>
          </div>
          <div class="filter-item">
            <label>性别:</label>
            <select
              value={selectedGender()}
              onChange={(e) => setSelectedGender(e.target.value as any)}
            >
              <For each={GENDERS}>{(g) => <option value={g}>{g}</option>}</For>
            </select>
          </div>
        </div>
      </div>

      <div class="events-content">
        <div class="events-sidebar">
          {filteredEvents().length === 0 ? (
            <div class="empty-state">暂无已结束的项目</div>
          ) : (
            <For each={filteredEvents()}>
              {(event) => (
                <div
                  class={`event-list-item ${selectedEvent()?.id === event.id ? 'active' : ''}`}
                  onClick={() => handleEventClick(event)}
                >
                  <div class="event-item-name">{event.name}</div>
                  <div class="event-item-meta">
                    <span>{event.gender}</span>
                    <span>·</span>
                    <span>{event.ageGroup}</span>
                  </div>
                </div>
              )}
            </For>
          )}
        </div>

        <div class="event-detail">
          {selectedEvent() ? (
            <>
              <div class="event-detail-header">
                <h3>{selectedEvent()!.name} - 完整排名</h3>
                <span class="event-distance">{selectedEvent()!.distance}米 {selectedEvent()!.stroke}</span>
              </div>
              <table class="ranking-table-full">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>赛道</th>
                    <th>选手</th>
                    <th>俱乐部</th>
                    <th>成绩</th>
                    <th>分段计时</th>
                    <th>收藏</th>
                  </tr>
                </thead>
                <tbody>
                  <For
                    each={[...selectedEvent()!.lanes].sort(
                      (a, b) => (a.rank || 999) - (b.rank || 999)
                    )}
                  >
                    {(lane) => (
                      <tr class={`rank-row rank-${lane.rank}`}>
                        <td class="rank-col">
                          {lane.rank === 1 ? '🥇' : lane.rank === 2 ? '🥈' : lane.rank === 3 ? '🥉' : lane.rank}
                        </td>
                        <td>{lane.laneNumber}</td>
                        <td>
                          <button
                            class="swimmer-link"
                            onClick={() => props.onSelectSwimmer(lane.swimmer)}
                          >
                            {lane.swimmer.name}
                          </button>
                        </td>
                        <td>{lane.swimmer.club}</td>
                        <td class="time-col">{formatTime(lane.finishTime)}</td>
                        <td class="split-col">
                          <For each={lane.splitTimes}>
                            {(t, i) => (
                              <span class="split-time">
                                {i() + 1}×50: {formatTime(t)}
                              </span>
                            )}
                          </For>
                        </td>
                        <td>
                          <button
                            class={`favorite-btn ${isFavoriteSwimmer(lane.swimmer.id) ? 'favorited' : ''}`}
                            onClick={() => toggleFavoriteSwimmer(lane.swimmer.id)}
                          >
                            {isFavoriteSwimmer(lane.swimmer.id) ? '★' : '☆'}
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </>
          ) : (
            <div class="empty-detail">请从左侧选择一个已结束的项目查看详细排名</div>
          )}
        </div>
      </div>
    </div>
  );
};
