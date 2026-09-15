import { lifecycleLabels, type Category, type Lifecycle, type SessionFilter } from '../types';
import { PlusIcon, TagIcon } from './Icons';

interface FilterBarProps {
  categories: Category[];
  availableTags: string[];
  filter: SessionFilter;
  onFilterChange: (patch: Partial<SessionFilter>) => void;
  onClear: () => void;
  onAddCategory: () => void;
  counts: { byCategory: Record<string, number>; byTag: Record<string, number>; byLifecycle: Record<string, number> };
}

export function FilterBar({ categories, availableTags, filter, onFilterChange, onClear, onAddCategory, counts }: FilterBarProps) {
  const toggleCategory = (id: string) => {
    const next = filter.categoryIds.includes(id)
      ? filter.categoryIds.filter((item) => item !== id)
      : [...filter.categoryIds, id];
    onFilterChange({ categoryIds: next });
  };

  const toggleTag = (tag: string) => {
    const next = filter.tags.includes(tag)
      ? filter.tags.filter((item) => item !== tag)
      : [...filter.tags, tag];
    onFilterChange({ tags: next });
  };

  const hasFilters = filter.categoryIds.length > 0 || filter.tags.length > 0 || filter.lifecycle !== null;

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">分类</span>
        {categories.map((category) => (
          <button
            key={category.id}
            className={`filter-chip category-chip ${filter.categoryIds.includes(category.id) ? 'on' : ''}`}
            onClick={() => toggleCategory(category.id)}
          >
            <i style={{ background: category.color }} />
            {category.name}
            <b>{counts.byCategory[category.id] || 0}</b>
          </button>
        ))}
        <button className="filter-chip add-chip" onClick={onAddCategory} title="新建分类">
          <PlusIcon size={11} />
        </button>
      </div>
      {availableTags.length > 0 && (
        <div className="filter-group">
          <span className="filter-label"><TagIcon size={11} /> 标签</span>
          {availableTags.map((tag) => (
            <button
              key={tag}
              className={`filter-chip tag-chip ${filter.tags.includes(tag) ? 'on' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
              <b>{counts.byTag[tag] || 0}</b>
            </button>
          ))}
        </div>
      )}
      <div className="filter-group">
        <span className="filter-label">周期</span>
        {(Object.keys(lifecycleLabels) as Exclude<Lifecycle, null>[]).map((key) => (
          <button
            key={key}
            className={`filter-chip lifecycle-chip ${filter.lifecycle === key ? 'on' : ''}`}
            onClick={() => onFilterChange({ lifecycle: filter.lifecycle === key ? null : key })}
          >
            {lifecycleLabels[key]}
            <b>{counts.byLifecycle[key] || 0}</b>
          </button>
        ))}
      </div>
      {hasFilters && (
        <button className="filter-clear" onClick={onClear}>
          清除筛选
        </button>
      )}
    </div>
  );
}
