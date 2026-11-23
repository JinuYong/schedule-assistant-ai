import type { MemoProperty } from "@cali/shared";
import { IconClose, IconPlus } from "@/components/icons";
import {
  FILTER_OPS,
  filterNeedsValue,
  filterOpLabel,
  type MemoFilter,
  type MemoSort,
  type SortKey,
} from "@/lib/memo-query";
import styles from "../page.module.css";

const BUILT_IN_SORTS: { key: SortKey; label: string }[] = [
  { key: "updatedAt", label: "수정한 날" },
  { key: "createdAt", label: "만든 날" },
  { key: "title", label: "제목" },
];

/** 조건 하나의 값 입력(속성 종류에 맞게) */
function FilterValue({
  property,
  filter,
  onChange,
}: {
  property: MemoProperty;
  filter: MemoFilter;
  onChange: (value: string) => void;
}) {
  const value = filter.value ?? "";
  switch (property.type) {
    case "select":
    case "multiSelect":
      return (
        <select
          className={styles.filterInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">선택지…</option>
          {property.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
    case "checkbox":
      return (
        <select
          className={styles.filterInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="true">켜짐</option>
          <option value="false">꺼짐</option>
        </select>
      );
    case "date":
      return (
        <input
          className={styles.filterInput}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <input
          className={styles.filterInput}
          inputMode={property.type === "number" ? "decimal" : undefined}
          value={value}
          placeholder="값"
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

const defaultFilter = (p: MemoProperty): MemoFilter => {
  const op = FILTER_OPS[p.type][0]!;
  return {
    propertyId: p.id,
    op,
    value: p.type === "checkbox" ? "true" : undefined,
  };
};

export default function FilterBar({
  properties,
  filters,
  sort,
  onFiltersChange,
  onSortChange,
}: {
  properties: MemoProperty[];
  filters: MemoFilter[];
  sort: MemoSort;
  onFiltersChange: (filters: MemoFilter[]) => void;
  onSortChange: (sort: MemoSort) => void;
}) {
  const byId = new Map(properties.map((p) => [p.id, p]));
  // 지운 속성의 조건은 보이지 않게
  const visible = filters.filter((f) => byId.has(f.propertyId));
  const replace = (i: number, next: MemoFilter) =>
    onFiltersChange(visible.map((f, j) => (j === i ? next : f)));

  return (
    <div className={styles.filterBar}>
      {visible.map((f, i) => {
        const p = byId.get(f.propertyId)!;
        return (
          <div key={i} className={styles.filterRow}>
            <select
              className={styles.filterInput}
              value={f.propertyId}
              onChange={(e) => {
                const next = byId.get(Number(e.target.value));
                if (next) replace(i, defaultFilter(next));
              }}
            >
              {properties.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              className={styles.filterInput}
              value={f.op}
              onChange={(e) =>
                replace(i, { ...f, op: e.target.value as MemoFilter["op"] })
              }
            >
              {FILTER_OPS[p.type].map((op) => (
                <option key={op} value={op}>
                  {filterOpLabel(p.type, op)}
                </option>
              ))}
            </select>
            {filterNeedsValue(f.op) && (
              <FilterValue
                property={p}
                filter={f}
                onChange={(value) => replace(i, { ...f, value })}
              />
            )}
            <button
              type="button"
              className={styles.iconBtn}
              title="조건 빼기"
              onClick={() => onFiltersChange(visible.filter((_, j) => j !== i))}
            >
              <IconClose />
            </button>
          </div>
        );
      })}

      <div className={styles.filterActions}>
        {properties.length > 0 && (
          <button
            type="button"
            className={styles.textBtn}
            onClick={() =>
              onFiltersChange([...visible, defaultFilter(properties[0]!)])
            }
          >
            <IconPlus /> 거르기
          </button>
        )}
        <label className={styles.sortControl}>
          <span>정렬</span>
          <select
            className={styles.filterInput}
            value={String(sort.key)}
            onChange={(e) => {
              const raw = e.target.value;
              const key: SortKey = /^\d+$/.test(raw)
                ? Number(raw)
                : (raw as SortKey);
              onSortChange({ ...sort, key });
            }}
          >
            {BUILT_IN_SORTS.map((s) => (
              <option key={String(s.key)} value={String(s.key)}>
                {s.label}
              </option>
            ))}
            {properties
              .filter((p) => p.type !== "url")
              .map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className={styles.iconBtn}
            title={sort.dir === "asc" ? "오름차순" : "내림차순"}
            onClick={() =>
              onSortChange({
                ...sort,
                dir: sort.dir === "asc" ? "desc" : "asc",
              })
            }
          >
            {sort.dir === "asc" ? "↑" : "↓"}
          </button>
        </label>
      </div>
    </div>
  );
}
