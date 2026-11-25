import { useEffect, useMemo, useState } from "react";
import { IconPlus, IconSearch } from "@/components/icons";
import {
  DEFAULT_SORT,
  queryMemos,
  type MemoFilter,
  type MemoSort,
} from "@/lib/memo-query";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { useMemosStore } from "@/store/memos";
import FilterBar from "./components/filter-bar";
import MemoEditor from "./components/memo-editor";
import MemoList from "./components/memo-list";
import { hasOptions } from "./memo-labels";
import styles from "./page.module.css";

const SEARCH_DELAY_MS = 250;
const VIEW_KEY = "memo.view";

interface MemoView {
  filters: MemoFilter[];
  sort: MemoSort;
  /** 목록에 보일 속성 id. 한 번도 안 골랐으면 없음 → 선택·다중 선택 속성 */
  shown?: number[];
}

/** 거르기·정렬·목록 보기는 이 기기에만 기억한다(사람마다 보는 방식이라 서버에 안 둔다) */
function loadView(): MemoView {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");
    if (saved && Array.isArray(saved.filters) && saved.sort)
      return {
        filters: saved.filters,
        sort: saved.sort,
        shown: Array.isArray(saved.shown)
          ? saved.shown.filter((id: unknown) => typeof id === "number")
          : undefined,
      };
  } catch {
    // 저장된 값이 없거나 깨졌으면 기본값
  }
  return { filters: [], sort: DEFAULT_SORT };
}

export default function MemoPage() {
  const properties = useMemosStore((s) => s.properties);
  const memos = useMemosStore((s) => s.memos);
  const isLoading = useMemosStore((s) => s.isLoading);
  const error = useMemosStore((s) => s.error);
  const matchIds = useMemosStore((s) => s.matchIds);
  const selectedId = useMemosStore((s) => s.selectedId);
  const current = useMemosStore((s) => s.current);
  const saveState = useMemosStore((s) => s.saveState);
  const {
    fetchMemos,
    search,
    select,
    createMemo,
    editCurrent,
    flush,
    deleteMemo,
  } = useMemosStore.getState();

  const [query, setQuery] = useState(() => useMemosStore.getState().query);
  const [view, setView] = useState(loadView);
  // 목록 패널: 오른쪽 가장자리를 끌어 넓이 조절(두 번 누르면 기본 넓이)
  const { width: listWidth, handleProps: listHandleProps } = useResizableWidth({
    storageKey: "memo.listWidth",
    initial: 320,
    min: 240,
    max: 560,
    edge: "end",
  });
  // 거르기를 건 뒤에 만들거나 고친 메모는 조건에 안 맞게 돼도 목록에 남긴다(고치는 사이 사라지지 않게).
  // 그냥 열어 둔 메모는 남기지 않는다 — 조건을 바꾸거나 다른 메모를 열면 풀린다.
  const [stickyId, setStickyId] = useState<number | null>(null);

  useEffect(() => {
    void fetchMemos();
    // 화면을 떠나거나 창을 닫을 때 기다리는 저장을 보낸다
    const onUnload = () => void flush();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      void flush();
    };
  }, [fetchMemos, flush]);

  useEffect(() => {
    const t = setTimeout(() => void search(query), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [query, search]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // 저장 못 해도 이번 화면에선 그대로 쓴다
    }
  }, [view]);

  const visible = useMemo(() => {
    const matched = matchIds
      ? memos.filter((m) => matchIds.includes(m.id))
      : memos;
    return queryMemos(matched, properties, view.filters, view.sort, stickyId);
  }, [memos, matchIds, properties, view, stickyId]);

  const newMemo = async () => {
    const before = useMemosStore.getState().selectedId;
    await createMemo();
    const after = useMemosStore.getState().selectedId;
    if (after !== null && after !== before) setStickyId(after);
  };

  const shownIds =
    view.shown ?? properties.filter((p) => hasOptions(p.type)).map((p) => p.id);
  const shownProperties = properties.filter((p) => shownIds.includes(p.id));

  const narrowed = matchIds !== null || view.filters.length > 0;

  return (
    <div className={styles.page}>
      <aside className={styles.listPane} style={{ width: listWidth }}>
        <div className={styles.listHeader}>
          <h1 className={styles.heading}>메모</h1>
          {isLoading && <span className={styles.loadingDot} />}
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void newMemo()}
          >
            <IconPlus /> 새 메모
          </button>
        </div>

        <FilterBar
          search={
            <label className={styles.search}>
              <IconSearch />
              <input
                type="search"
                value={query}
                placeholder="제목·본문 검색"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          }
          properties={properties}
          filters={view.filters}
          sort={view.sort}
          onFiltersChange={(filters) => {
            setStickyId(null);
            setView((v) => ({ ...v, filters }));
          }}
          onSortChange={(sort) => setView((v) => ({ ...v, sort }))}
          shownIds={shownIds}
          onShownChange={(shown) => setView((v) => ({ ...v, shown }))}
        />

        {error && <p className={styles.error}>{error}</p>}
        {narrowed && (
          <p className={styles.count}>
            {visible.length} / {memos.length}개
          </p>
        )}
        {visible.length > 0 ? (
          <MemoList
            memos={visible}
            properties={shownProperties}
            selectedId={selectedId}
            onSelect={(id) => {
              if (id !== stickyId) setStickyId(null);
              void select(id);
            }}
          />
        ) : (
          !isLoading &&
          !error && (
            <p className={styles.empty}>
              {narrowed ? "맞는 메모가 없습니다." : "메모가 없습니다."}
            </p>
          )
        )}
      </aside>
      <div
        className={styles.resizer}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={listWidth}
        title="끌어서 목록 넓이 조절 · 두 번 누르면 기본 넓이"
        {...listHandleProps}
      />

      <section className={styles.editorPane}>
        {current ? (
          <MemoEditor
            key={current.id}
            memo={current}
            properties={properties}
            saveState={saveState}
            onEdit={(patch) => {
              setStickyId(current.id);
              editCurrent(patch);
            }}
            onDelete={() => void deleteMemo(current.id)}
          />
        ) : (
          <div className={styles.placeholder}>
            {selectedId !== null ? (
              <span className={styles.loadingDot} />
            ) : (
              <>
                <p>메모를 고르거나 새로 만드세요.</p>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => void newMemo()}
                >
                  <IconPlus /> 새 메모
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
