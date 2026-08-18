import { useState } from "react";
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
 */
export default function LocationField({ value, onChange }: LocationFieldProps) {
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const runSearch = async () => {
    const q = value.trim();
    if (!q || searching) return;
    setSearching(true);
    setError("");
    setResults(null);
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
    setResults(null);
    setError("");
  };

  return (
    <>
      <div className={styles.locationInputRow}>
        <input
          className={styles.formInput}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setResults(null);
            setError("");
          }}
          onKeyDown={(e) => {
            // 폼 안이라 Enter가 일정 저장으로 새는 것을 막고 검색으로 돌린다
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
          placeholder="장소 또는 가게 이름"
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

      {searching && <p className={styles.placeHint}>검색 중...</p>}
      {error && <p className={styles.placeError}>{error}</p>}
      {results?.length === 0 && <p className={styles.placeHint}>검색 결과가 없습니다.</p>}

      {!!results?.length && (
        <ul className={styles.placeList}>
          {results.map((p, i) => (
            <li key={`${p.name}-${i}`}>
              <button type="button" className={styles.placeItem} onClick={() => pick(p)}>
                <span className={styles.placeName}>{p.name}</span>
                <span className={styles.placeAddr}>{p.roadAddress || p.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
