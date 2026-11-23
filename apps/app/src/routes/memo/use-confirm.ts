import { useEffect, useState } from "react";

/** 지우기처럼 되돌릴 수 없는 동작은 두 번 눌러서(첫 번째 누르고 3초 안) */
export function useConfirm(ms = 3000) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), ms);
    return () => clearTimeout(t);
  }, [confirming, ms]);
  return {
    confirming,
    ask: (action: () => void) => (confirming ? action() : setConfirming(true)),
  };
}
