import type { Category } from '../types';
import { StarIcon, TagIcon } from './Icons';

interface BatchBarProps {
  count: number;
  categories: Category[];
  onBatchFavorite: () => void;
  onBatchUnfavorite: () => void;
  onBatchTag: () => void;
  onBatchCategory: (categoryId: string) => void;
  onBatchClearLifecycle: () => void;
  onCancel: () => void;
}

export function BatchBar({
  count, categories, onBatchFavorite, onBatchUnfavorite, onBatchTag, onBatchCategory, onBatchClearLifecycle, onCancel,
}: BatchBarProps) {
  if (count === 0) return null;

  return (
    <div className="batch-bar">
      <span className="batch-count">已选 <b>{count}</b> 个会话</span>
      <div className="batch-actions">
        <button onClick={onBatchFavorite}>
          <StarIcon size={12} />
          收藏
        </button>
        <button onClick={onBatchUnfavorite}>
          <StarIcon size={12} />
          取消收藏
        </button>
        <button onClick={onBatchTag}>
          <TagIcon size={12} />
          打标签
        </button>
        <span className="batch-divider" />
        <select
          className="batch-category-select"
          value=""
          onChange={(event) => {
            if (event.target.value) onBatchCategory(event.target.value);
            event.target.value = '';
          }}
        >
          <option value="">加入分类…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <button onClick={onBatchClearLifecycle}>清除周期</button>
      </div>
      <button className="batch-cancel" onClick={onCancel}>取消</button>
    </div>
  );
}
