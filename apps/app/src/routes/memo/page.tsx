import { useEffect, useMemo, useState } from "react";
import { IconPlus, IconSearch } from "@/components/icons";
import {
  DEFAULT_SORT,
  queryMemos,
  type MemoFilter,
  type MemoSort,
} from "@/lib/memo-query";
import { useMemosStore } from "@/store/memos";
import FilterBar from "./components/filter-bar";
import MemoEditor from "./components/memo-editor";
import MemoList from "./components/memo-list";
import PropertyManager from "./components/property-manager";
import styles from "./page.module.css";

const SEARCH_DELAY_MS = 250;
const VIEW_KEY = "memo.view";

/** 거르기·정렬은 이 기기에만 기억한다(사람마다 보는 방식이라 서버에 안 둔다) */
function loadView(): { filters: MemoFilter[]; sort: MemoSort } {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null");
    if (saved && Array.isArray(saved.filters) && saved.sort)
      return { filters: saved.filters, sort: saved.sort };
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
  const [managing, setManaging] = useState(false);

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
    return queryMemos(matched, properties, view.filters, view.sort, selectedId);
  }, [memos, matchIds, properties, view, selectedId]);

  const narrowed = matchIds !== null || view.filters.length > 0;

  return (
    <div className={styles.page}>
      <aside className={styles.listPane}>
        <div className={styles.listHeader}>
          <h1 className={styles.heading}>메모</h1>
          {isLoading && <span className={styles.loadingDot} />}
          <button
            type="button"
            className={styles.textBtn}
            onClick={() => setManaging(true)}
          >
            속성
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void createMemo()}
          >
            <IconPlus /> 새 메모
          </button>
        </div>

        <label className={styles.search}>
          <IconSearch />
          <input
            type="search"
            value={query}
            placeholder="제목·본문 검색"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <FilterBar
          properties={properties}
          filters={view.filters}
          sort={view.sort}
          onFiltersChange={(filters) => setView((v) => ({ ...v, filters }))}
          onSortChange={(sort) => setView((v) => ({ ...v, sort }))}
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
            properties={properties}
            selectedId={selectedId}
            onSelect={(id) => void select(id)}
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

      <section className={styles.editorPane}>
        {current ? (
          <MemoEditor
            key={current.id}
            memo={current}
            properties={properties}
            saveState={saveState}
            onEdit={editCurrent}
            onDelete={() => void deleteMemo(current.id)}
            onManageProperties={() => setManaging(true)}
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
                  onClick={() => void createMemo()}
                >
                  <IconPlus /> 새 메모
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {managing && <PropertyManager onClose={() => setManaging(false)} />}
    </div>
  );
}
