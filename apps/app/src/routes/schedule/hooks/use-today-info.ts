import { useCallback, useEffect, useState } from "react";
import { getTodayInfo, msUntilNextDay } from "../calendar-utils";

/**
 * "오늘" 정보를 자정 경과 / 창 포커스 / 탭 가시성 변화 시 자동 갱신.
 * 날짜가 실제로 바뀐 경우에만 새 객체로 교체해 불필요한 리렌더를 막는다.
 */
export function useTodayInfo() {
  const [todayInfo, setTodayInfo] = useState(getTodayInfo);

  const refreshTodayInfo = useCallback(() => {
    const nextToday = getTodayInfo();
    setTodayInfo((prev) => prev.date === nextToday.date ? prev : nextToday);
    return nextToday;
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleMidnightRefresh = () => {
      timeoutId = setTimeout(() => {
        refreshTodayInfo();
        scheduleMidnightRefresh();
      }, msUntilNextDay());
    };

    const handleFocus = () => {
      refreshTodayInfo();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) refreshTodayInfo();
    };

    scheduleMidnightRefresh();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshTodayInfo]);

  return { todayInfo, refreshTodayInfo };
}
