// 목록 위 도구줄: 검색창 옆 거르기·정렬 버튼(누르면 팝오버) + 걸어 둔 조건 칩.

import { useRef, useState, type ReactNode } from "react";
import type { MemoProperty } from "@cali/shared";
import {
  IconCheck,
  IconChevron,
  IconFilter,
  IconSort,
  IconTrash,
} from "@/components/icons";
import {
  DEFAULT_SORT,
  FILTER_OPS,
  filterNeedsValue,
  filterOpLabel,
  filterOptionIds,
  type MemoFilter,
  type MemoSort,
  type SortKey,
} from "@/lib/memo-query";
import { cleanNumberInput } from "@/lib/number-input";
import { optionClass } from "../memo-labels";
import Popover, {
  MenuDivider,
  MenuInput,
  MenuItem,
  MenuLabel,
  usePopover,
} from "./popover";
import PropertyTypeIcon from "./property-type-icon";
import styles from "./filter-bar.module.css";

const BUILT_IN_SORTS: { key: SortKey; label: string }[] = [
  { key: "updatedAt", label: "수정한 날" },
  { key: "createdAt", label: "만든 날" },
  { key: "title", label: "제목" },
];

const defaultFilter = (p: MemoProperty): MemoFilter => ({
  propertyId: p.id,
  op: FILTER_OPS[p.type][0]!,
  value: p.type === "checkbox" ? "true" : undefined,
});

/** 칩에 보일 조건 요약. 값을 아직 안 골랐으면 속성 이름만 */
function summary(p: MemoProperty, f: MemoFilter): string | null {
  if (!filterNeedsValue(f.op)) return filterOpLabel(p.type, f.op);
  if (p.type === "select" || p.type === "multiSelect") {
    const names = filterOptionIds(f).flatMap(
      (id) => p.options.find((o) => o.id === id)?.name ?? [],
    );
    if (names.length < 2) return names[0] ?? null;
    const all = p.type === "multiSelect" && f.op === "containsAll";
    return `${names.join(", ")} ${all ? "모두" : "중 하나"}`;
  }
  if (!f.value) return null;
  switch (p.type) {
    case "checkbox":
      return f.value === "true" ? "체크" : "체크 해제";
    case "number":
      return f.op === "gt"
        ? `> ${f.value}`
        : f.op === "lt"
          ? `< ${f.value}`
          : f.value;
    case "date":
      return f.op === "is"
        ? f.value
        : `${f.value} ${filterOpLabel(p.type, f.op)}`;
    default:
      return f.value;
  }
}

function sortLabel(sort: MemoSort, properties: MemoProperty[]) {
  const name =
    BUILT_IN_SORTS.find((s) => s.key === sort.key)?.label ??
    properties.find((p) => p.id === sort.key)?.name ??
    "수정한 날";
  return `${name} ${sort.dir === "asc" ? "오름차순" : "내림차순"}`;
}

export default function FilterBar({
  search,
  properties,
  filters,
  sort,
  onFiltersChange,
  onSortChange,
}: {
  /** 검색창(도구줄 왼쪽) */
  search: ReactNode;
  properties: MemoProperty[];
  filters: MemoFilter[];
  sort: MemoSort;
  onFiltersChange: (filters: MemoFilter[]) => void;
  onSortChange: (sort: MemoSort) => void;
}) {
  const byId = new Map(properties.map((p) => [p.id, p]));
  // 지운 속성의 조건은 보이지 않게
  const visible = filters.filter((f) => byId.has(f.propertyId));
  // 방금 추가한 조건은 칩의 창을 바로 연다
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [addMenuRef, addMenu] = usePopover();
  const [sortMenuRef, sortMenu] = usePopover();
  const sorted = sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir;

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        {search}
        <button
          ref={addMenuRef}
          type="button"
          className={`${styles.toolBtn}${visible.length || addMenu.open ? ` ${styles.toolBtnOn}` : ""}`}
          title="거르기"
          onClick={addMenu.toggle}
        >
          <IconFilter />
        </button>
        <button
          ref={sortMenuRef}
          type="button"
          className={`${styles.toolBtn}${sorted || sortMenu.open ? ` ${styles.toolBtnOn}` : ""}`}
          title={`정렬: ${sortLabel(sort, properties)}`}
          onClick={sortMenu.toggle}
        >
          <IconSort />
        </button>
      </div>

      {addMenu.open && (
        <Popover anchor={addMenuRef} onClose={addMenu.close} align="end">
          <MenuLabel>거를 속성</MenuLabel>
          {properties.length ? (
            properties.map((p) => (
              <MenuItem
                key={p.id}
                icon={<PropertyTypeIcon type={p.type} />}
                onClick={() => {
                  addMenu.close();
                  onFiltersChange([...visible, defaultFilter(p)]);
                  setOpenIndex(visible.length);
                }}
              >
                {p.name}
              </MenuItem>
            ))
          ) : (
            <p className={styles.hint}>
              속성이 없어요. 메모를 열고 “속성 추가”로 만들어 보세요.
            </p>
          )}
        </Popover>
      )}

      {sortMenu.open && (
        <Popover
          anchor={sortMenuRef}
          onClose={sortMenu.close}
          align="end"
          width={220}
        >
          <MenuLabel>정렬 기준</MenuLabel>
          {BUILT_IN_SORTS.map((s) => (
            <MenuItem
              key={String(s.key)}
              trailing={sort.key === s.key ? <IconCheck /> : undefined}
              onClick={() => onSortChange({ ...sort, key: s.key })}
            >
              {s.label}
            </MenuItem>
          ))}
          {properties.some((p) => p.type !== "url") && <MenuDivider />}
          {properties
            .filter((p) => p.type !== "url")
            .map((p) => (
              <MenuItem
                key={p.id}
                icon={<PropertyTypeIcon type={p.type} />}
                trailing={sort.key === p.id ? <IconCheck /> : undefined}
                onClick={() => onSortChange({ ...sort, key: p.id })}
              >
                {p.name}
              </MenuItem>
            ))}
          <MenuDivider />
          <div className={styles.segmented}>
            {(["asc", "desc"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                aria-pressed={sort.dir === dir}
                onClick={() => onSortChange({ ...sort, dir })}
              >
                {dir === "asc" ? "↑ 오름차순" : "↓ 내림차순"}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {visible.length > 0 && (
        <div className={styles.chips}>
          {visible.map((f, i) => (
            <FilterChip
              key={i}
              property={byId.get(f.propertyId)!}
              filter={f}
              open={openIndex === i}
              onOpenChange={(open) => setOpenIndex(open ? i : null)}
              onChange={(next) =>
                onFiltersChange(visible.map((x, j) => (j === i ? next : x)))
              }
              onRemove={() => {
                setOpenIndex(null);
                onFiltersChange(visible.filter((_, j) => j !== i));
              }}
            />
          ))}
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => {
              setOpenIndex(null);
              onFiltersChange([]);
            }}
          >
            모두 지우기
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  property,
  filter,
  open,
  onOpenChange,
  onChange,
  onRemove,
}: {
  property: MemoProperty;
  filter: MemoFilter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (filter: MemoFilter) => void;
  onRemove: () => void;
}) {
  const chipRef = useRef<HTMLButtonElement>(null);
  const [opMenuRef, opMenu] = usePopover();
  const text = summary(property, filter);
  const ops = FILTER_OPS[property.type];

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        className={`${styles.chip}${text ? ` ${styles.chipOn}` : ""}`}
        onClick={() => onOpenChange(!open)}
      >
        <PropertyTypeIcon type={property.type} size={12} />
        <span className={styles.chipText}>
          {property.name}
          {text && `: ${text}`}
        </span>
        <IconChevron open={open} />
      </button>

      {open && (
        <Popover
          anchor={chipRef}
          onClose={() => onOpenChange(false)}
          width={260}
        >
          <div className={styles.filterHead}>
            <span className={styles.filterName}>{property.name}</span>
            {ops.length > 1 && (
              <button
                ref={opMenuRef}
                type="button"
                className={styles.opBtn}
                onClick={opMenu.toggle}
              >
                {filterOpLabel(property.type, filter.op)}
                <IconChevron open={opMenu.open} />
              </button>
            )}
            <button
              type="button"
              className={styles.removeBtn}
              title="조건 지우기"
              onClick={onRemove}
            >
              <IconTrash />
            </button>
          </div>
          {opMenu.open && (
            <Popover anchor={opMenuRef} onClose={opMenu.close} width={160}>
              {ops.map((op) => (
                <MenuItem
                  key={op}
                  trailing={op === filter.op ? <IconCheck /> : undefined}
                  onClick={() => {
                    opMenu.close();
                    onChange({ ...filter, op });
                  }}
                >
                  {filterOpLabel(property.type, op)}
                </MenuItem>
              ))}
            </Popover>
          )}
          {filterNeedsValue(filter.op) && (
            <FilterValue
              property={property}
              filter={filter}
              onChange={onChange}
            />
          )}
        </Popover>
      )}
    </>
  );
}

/** 조건 값: 선택은 목록에서 여러 개, 체크박스는 체크/체크 해제, 나머지는 입력 */
function FilterValue({
  property,
  filter,
  onChange: onFilterChange,
}: {
  property: MemoProperty;
  filter: MemoFilter;
  onChange: (filter: MemoFilter) => void;
}) {
  const { op } = filter;
  const value = filter.value ?? "";
  const onChange = (value: string) => onFilterChange({ ...filter, value });
  const ids = filterOptionIds(filter);
  switch (property.type) {
    case "select":
    case "multiSelect":
      return property.options.length ? (
        <>
          {property.options.map((o) => (
            <MenuItem
              key={o.id}
              trailing={ids.includes(o.id) ? <IconCheck /> : undefined}
              onClick={() =>
                onFilterChange({
                  ...filter,
                  value: undefined,
                  values: ids.includes(o.id)
                    ? ids.filter((id) => id !== o.id)
                    : [...ids, o.id],
                })
              }
            >
              <span className={optionClass(o.color)}>{o.name}</span>
            </MenuItem>
          ))}
        </>
      ) : (
        <p className={styles.hint}>선택지가 없어요.</p>
      );
    case "checkbox":
      return (
        <>
          {(["true", "false"] as const).map((v) => (
            <MenuItem
              key={v}
              trailing={value === v ? <IconCheck /> : undefined}
              onClick={() => onChange(v)}
            >
              {v === "true" ? "체크" : "체크 해제"}
            </MenuItem>
          ))}
        </>
      );
    default:
      return (
        <div className={styles.valuePad}>
          <MenuInput
            autoFocus
            type={property.type === "date" ? "date" : "text"}
            inputMode={property.type === "number" ? "decimal" : undefined}
            value={value}
            placeholder={
              property.type === "number"
                ? op === "is"
                  ? "숫자"
                  : "기준 숫자"
                : "값 입력"
            }
            onChange={(e) =>
              onChange(
                property.type === "number"
                  ? cleanNumberInput(e.target.value)
                  : e.target.value,
              )
            }
          />
        </div>
      );
  }
}
