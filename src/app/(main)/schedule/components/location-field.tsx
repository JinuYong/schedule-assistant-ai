import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconSearch } from "@/components/icons";
import { searchPlaces, toLocationString, PlaceResult } from "@/lib/naver-place";
import styles from "../page.module.css";

interface LocationFieldProps {
  value: string;
  onChange: (next: string) => void;
}

/**
 * 일정 폼의 장소 입력.
 *
 * 상호명만 알 때 🔍로 네이버 지역검색을 돌려 "상호명, 도로명주소"를 채운다.
 * 주소를 이미 알고 있으면 그냥 타이핑해도 되고, 회의실처럼 주소가 없는 장소는
 * 검색하지 않고 문자열로 남긴다(상세 모달에서 지도 링크가 나타나지 않는다).
 *
 * 검색 결과는 입력창 아래 드롭다운으로 띄운다. 폼 흐름에 끼워 넣으면 아래 필드가
 * 밀려 내려가 모달 높이가 출렁이기 때문이다.
 *
 * 드롭다운은 `document.body`로 포털한다. 장소는 폼의 마지막 필드라
 * 모달 본문(`overflow-y: auto`)에 그대로 두면 스크롤 경계에서 잘려 버린다.
 */
export default function LocationField({ value, onChange }: LocationFieldProps) {
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  /** 키보드로 이동 중인 항목. -1이면 선택 없음 */
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  /** 포털로 띄운 드롭다운을 입력창에 붙이기 위한 화면 좌표 */
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  /** 검색 중이거나 결과(0건 포함)가 있으면 드롭다운을 띄운다 */
  const showDropdown = searching || results !== null;

  const close = () => {
    setResults(null);
    setActiveIndex(-1);
  };

  const runSearch = async () => {
    const q = value.trim();
    if (!q || searching) return;
    setSearching(true);
    setError("");
    setResults(null);
    setActiveIndex(-1);
    try {
      setResults(await searchPlaces(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : "장소 검색에 실패했습니다.");
    } finally {
      setSearching(false);
    }
  };

  const pick = (place: PlaceResult) => {
    onChange(toLocationString(place));
    close();
    setError("");
  };

  const updateAnchor = useCallback(() => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  // 포털은 문서 흐름 밖이라 입력창을 따라오지 않는다.
  // 모달 본문 스크롤(capture로 잡는다)과 창 리사이즈에 맞춰 좌표를 갱신한다.
  useLayoutEffect(() => {
    if (!showDropdown) return;
    updateAnchor();
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [showDropdown, updateAnchor]);

  // 키보드로 내려간 항목이 스크롤 밖에 있으면 따라 스크롤한다.
  // (드롭다운은 3건까지만 펼쳐지므로 4번째부터는 가려진 채 활성화된다)
  // scrollIntoView는 조상까지 스크롤시킬 수 있어 scrollTop을 직접 조정한다.
  useEffect(() => {
    if (activeIndex < 0) return;
    const list = dropdownRef.current;
    const item = list?.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex];
    if (!list || !item) return;

    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < listRect.top) {
      list.scrollTop -= listRect.top - itemRect.top;
    } else if (itemRect.bottom > listRect.bottom) {
      list.scrollTop += itemRect.bottom - listRect.bottom;
    }
  }, [activeIndex]);

  // 바깥을 클릭하면 닫는다 (드롭다운의 기본 기대 동작).
  // 포털된 드롭다운은 wrapRef 바깥이므로 따로 확인해야 한다 —
  // 빠뜨리면 항목을 누르는 순간 mousedown이 먼저 닫아버려 클릭이 먹지 않는다.
  useEffect(() => {
    if (!showDropdown) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showDropdown]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const items = results ?? [];

    if (e.key === "Escape" && showDropdown) {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => (i + delta + items.length) % items.length);
      return;
    }

    if (e.key === "Enter") {
      // 폼 안이라 Enter가 일정 저장으로 새는 것을 막는다.
      e.preventDefault();
      const active = items[activeIndex];
      if (active) pick(active);
      else void runSearch();
    }
  };

  return (
    <div className={styles.locationField} ref={wrapRef}>
      <div className={styles.locationInputRow} ref={rowRef}>
        <input
          className={styles.formInput}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            close();
            setError("");
          }}
          onKeyDown={onKeyDown}
          placeholder="장소 또는 가게 이름"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="location-suggestions"
          aria-autocomplete="list"
        />
        <button
          type="button"
          className={styles.todoModalIconBtn}
          onClick={() => void runSearch()}
          disabled={!value.trim() || searching}
          title="네이버에서 장소 검색"
        >
          <IconSearch/>
        </button>
      </div>

      {/* 에러는 조치가 필요한 정보라 드롭다운에 넣지 않는다 — 바깥 클릭으로 사라지면 안 된다 */}
      {error && <p className={styles.placeError}>{error}</p>}

      {showDropdown && anchor && createPortal(
        <div
          className={styles.placeDropdown}
          ref={dropdownRef}
          style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
        >
          {searching && <p className={styles.placeHint}>검색 중...</p>}
          {!searching && results?.length === 0 && (
            <p className={styles.placeHint}>검색 결과가 없습니다.</p>
          )}
          {!!results?.length && (
            <ul className={styles.placeList} id="location-suggestions" role="listbox">
              {results.map((p, i) => (
                <li key={`${p.name}-${i}`} role="option" aria-selected={i === activeIndex}>
                  <button
                    type="button"
                    className={`${styles.placeItem} ${i === activeIndex ? styles.placeItemActive : ""}`}
                    onClick={() => pick(p)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <span className={styles.placeName}>{p.name}</span>
                    <span className={styles.placeAddr}>{p.roadAddress || p.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
