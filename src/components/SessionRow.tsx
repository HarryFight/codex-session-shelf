import { lifecycleLabels, type Category, type ManagedSession, type NativeSession } from '../types';
import { ArrowUpRightIcon, CheckIcon, PinIcon, StarIcon } from './Icons';

interface SessionRowProps {
  session: NativeSession;
  managed: ManagedSession;
  categories: Category[];
  selected: boolean;
  selectMode: boolean;
  checked: boolean;
  isCurrent: boolean;
  onSelect: (session: NativeSession) => void;
  onOpen: (session: NativeSession) => void;
  onToggleFavorite: (session: NativeSession, managed: ManagedSession) => void;
  onTogglePin: (session: NativeSession, managed: ManagedSession) => void;
  onToggleCheck: (id: string) => void;
}

export function SessionRow({
  session, managed, categories, selected, selectMode, checked, isCurrent,
  onSelect, onOpen, onToggleFavorite, onTogglePin, onToggleCheck,
}: SessionRowProps) {
  const sessionCategories = categories.filter((category) => managed.categoryIds.includes(category.id));

  return (
    <article
      className={`session-row ${selected ? 'selected' : ''} ${isCurrent ? 'current' : ''} ${checked ? 'checked' : ''}`}
      onClick={() => selectMode ? onToggleCheck(session.id) : onSelect(session)}
    >
      {selectMode && (
        <button
          className={`row-check ${checked ? 'on' : ''}`}
          onClick={(event) => { event.stopPropagation(); onToggleCheck(session.id); }}
          aria-label={checked ? '取消选择' : '选择会话'}
        >
          {checked && <CheckIcon size={11} />}
        </button>
      )}
      <button
        className={`row-action pin ${managed.pinned ? 'on' : ''}`}
        onClick={(event) => { event.stopPropagation(); onTogglePin(session, managed); }}
        title={managed.pinned ? '取消置顶' : '置顶'}
      >
        <PinIcon size={13} />
      </button>
      <button
        className={`row-action star ${managed.favorite ? 'on' : ''}`}
        onClick={(event) => { event.stopPropagation(); onToggleFavorite(session, managed); }}
        title={managed.favorite ? '移出收藏' : '加入收藏'}
      >
        <StarIcon size={14} filled={managed.favorite} />
      </button>
      <div className="row-body" onClick={() => !selectMode && onSelect(session)}>
        <div className="row-title-line">
          <strong>{session.title}</strong>
          {session.nativePinned && <span className="native-pin">原生置顶</span>}
          {managed.lifecycle && <span className={`lifecycle-badge ${managed.lifecycle}`}>{lifecycleLabels[managed.lifecycle]}</span>}
        </div>
        {(managed.nextAction || managed.summary) && (
          <p className="row-preview">{managed.nextAction || managed.summary}</p>
        )}
        {(sessionCategories.length > 0 || managed.tags.length > 0) && (
          <div className="row-meta">
            {sessionCategories.map((category) => (
              <span key={category.id} className="meta-chip category">
                <i style={{ background: category.color }} />
                {category.name}
              </span>
            ))}
            {managed.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="meta-chip tag">#{tag}</span>
            ))}
            {managed.tags.length > 4 && <span className="meta-chip more">+{managed.tags.length - 4}</span>}
          </div>
        )}
      </div>
      <button
        className="row-open"
        onClick={(event) => { event.stopPropagation(); onOpen(session); }}
        title="在 Codex 中打开此会话"
      >
        打开
        <ArrowUpRightIcon size={12} />
      </button>
    </article>
  );
}
