import { lifecycleLabels, type Category, type Lifecycle, type ManagedSession, type NativeSession } from '../types';
import { ArrowUpRightIcon, StarIcon } from './Icons';

interface DetailPanelProps {
  session: NativeSession | null;
  managed: ManagedSession | null;
  categories: Category[];
  onUpdate: (id: string, patch: Partial<ManagedSession>) => void;
  onOpen: (session: NativeSession) => void;
  onClose: () => void;
}

export function DetailPanel({ session, managed, categories, onUpdate, onOpen, onClose }: DetailPanelProps) {
  if (!session || !managed) {
    return (
      <aside className="detail-panel empty">
        <div className="detail-placeholder">
          <span className="placeholder-icon">⌖</span>
          <h3>选择一个会话</h3>
          <p>在这里维护摘要、下一步、分类和标签</p>
        </div>
      </aside>
    );
  }

  const toggleCategory = (categoryId: string) => {
    const next = managed.categoryIds.includes(categoryId)
      ? managed.categoryIds.filter((id) => id !== categoryId)
      : [...managed.categoryIds, categoryId];
    onUpdate(session.id, { categoryIds: next });
  };

  return (
    <aside className="detail-panel visible">
      <header className="detail-header">
        <div className="detail-header-content">
          <p className="detail-eyebrow">会话详情</p>
          <h3 title={session.title}>{session.title}</h3>
        </div>
        <div className="detail-header-actions">
          <button
            className={`detail-star ${managed.favorite ? 'on' : ''}`}
            onClick={() => onUpdate(session.id, { favorite: !managed.favorite })}
            title={managed.favorite ? '移出收藏' : '加入收藏'}
          >
            <StarIcon size={15} filled={managed.favorite} />
          </button>
          <button className="detail-open" onClick={() => onOpen(session)}>
            打开会话
            <ArrowUpRightIcon size={13} />
          </button>
          <button className="detail-close" onClick={onClose} aria-label="关闭详情">×</button>
        </div>
      </header>

      <div className="detail-scroll">
        <label className="detail-field">
          <span>生命周期</span>
          <div className="lifecycle-picker">
            <button
              className={!managed.lifecycle ? 'on' : ''}
              onClick={() => onUpdate(session.id, { lifecycle: null })}
            >
              未设置
            </button>
            {(Object.keys(lifecycleLabels) as Exclude<Lifecycle, null>[]).map((key) => (
              <button
                key={key}
                className={managed.lifecycle === key ? 'on' : ''}
                onClick={() => onUpdate(session.id, { lifecycle: key })}
              >
                {lifecycleLabels[key]}
              </button>
            ))}
          </div>
        </label>

        <label className="detail-field">
          <span>分类</span>
          <div className="category-picker">
            {categories.map((category) => (
              <button
                key={category.id}
                className={managed.categoryIds.includes(category.id) ? 'on' : ''}
                onClick={() => toggleCategory(category.id)}
              >
                <i style={{ background: category.color }} />
                {category.name}
              </button>
            ))}
            {categories.length === 0 && <p className="field-empty">还没有分类，在筛选栏点击 + 新建</p>}
          </div>
        </label>

        <label className="detail-field">
          <span>标签</span>
          <input
            value={managed.tags.join(', ')}
            onChange={(event) => onUpdate(session.id, {
              tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
            })}
            placeholder="用英文逗号分隔，如：调研, CLI, 权限"
          />
        </label>

        <label className="detail-field">
          <span>摘要</span>
          <textarea
            value={managed.summary}
            onChange={(event) => onUpdate(session.id, { summary: event.target.value })}
            placeholder="这段会话需要长期记住什么？"
            rows={3}
          />
        </label>

        <label className="detail-field">
          <span>下一步</span>
          <input
            value={managed.nextAction}
            onChange={(event) => onUpdate(session.id, { nextAction: event.target.value })}
            placeholder="下次打开先做什么？"
          />
        </label>
      </div>
    </aside>
  );
}
