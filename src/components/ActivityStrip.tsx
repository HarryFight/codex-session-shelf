import { useMemo, useState } from 'react';
import type { ManagedSession, NativeSession, Store } from '../types';
import { ArrowUpRightIcon, ChevronIcon, PulseIcon, StarIcon } from './Icons';

interface ActivityStripProps {
  sessions: NativeSession[];
  store: Store;
  onOpen: (session: NativeSession) => void;
}

export function ActivityStrip({ sessions, store, onOpen }: ActivityStripProps) {
  const [collapsed, setCollapsed] = useState(false);

  const activeSessions = useMemo(() => {
    return sessions
      .filter((session) => store.sessions[session.id]?.lifecycle === 'active')
      .sort((left, right) => {
        const leftTime = store.sessions[left.id]?.updatedAt || 0;
        const rightTime = store.sessions[right.id]?.updatedAt || 0;
        return rightTime - leftTime;
      });
  }, [sessions, store.sessions]);

  if (activeSessions.length === 0) return null;

  return (
    <section className="activity-strip" aria-label="进行中的会话">
      <button className="activity-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="activity-title">
          <PulseIcon size={13} className="activity-pulse" />
          进行中
        </span>
        <span className="activity-meta">
          <b>{activeSessions.length}</b>
          <ChevronIcon size={13} direction={collapsed ? 'up' : 'down'} />
        </span>
      </button>
      {!collapsed && (
        <div className="activity-list">
          {activeSessions.map((session) => {
            const managed = store.sessions[session.id];
            return (
              <div className="activity-row" key={session.id}>
                <span className="activity-dot" />
                <button
                  className="activity-name"
                  onClick={() => onOpen(session)}
                  title={session.title}
                >
                  {managed?.favorite && <StarIcon size={11} filled className="activity-star" />}
                  {session.title}
                </button>
                <button
                  className="activity-open"
                  onClick={() => onOpen(session)}
                  title="在 Codex 中打开"
                >
                  打开
                  <ArrowUpRightIcon size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
