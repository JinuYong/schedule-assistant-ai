import type { ReactNode } from "react";
import type { MemoPropertyType } from "@cali/shared";

/** 속성 종류 아이콘(노션처럼 이름 앞에 붙인다) */
export default function PropertyTypeIcon({
  type,
  size = 14,
}: {
  type: MemoPropertyType;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[type]}
    </svg>
  );
}

const PATHS: Record<MemoPropertyType, ReactNode> = {
  // 줄 세 개(글)
  text: <path d="M4 6h16M4 12h16M4 18h10" />,
  // #
  number: <path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16" />,
  // 동그라미 안 아래 화살표
  select: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
    </>
  ),
  // 점 달린 목록
  multiSelect: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" />
    </>
  ),
  date: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  checkbox: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  url: (
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </>
  ),
};
