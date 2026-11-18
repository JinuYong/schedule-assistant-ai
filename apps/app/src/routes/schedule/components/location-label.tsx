import { parseLocationLabel } from "@/lib/location";

interface LocationLabelProps {
  location: string;
  className?: string;
  /** 앞에 📍 핀 이모지를 붙일지 (리스트용) */
  withPin?: boolean;
}

/**
 * 장소를 간결 라벨로 보여주되, 호버 시 원본 전체를 툴팁으로 표시한다.
 * 원본 전체는 클릭해서 연 상세 모달에서 확인한다.
 */
export default function LocationLabel({ location, className, withPin }: LocationLabelProps) {
  const label = parseLocationLabel(location);
  return (
    <span className={className} title={location}>
      {withPin ? `📍 ${label}` : label}
    </span>
  );
}
