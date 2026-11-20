import type { TodoRepeat } from "@cali/shared";
import {
  defaultRepeat,
  monthlyOnLabel,
  monthlyOptions,
  repeatLabel,
  weekdayName,
} from "@/lib/todo-form";
import styles from "../page.module.css";

const TYPES: { value: TodoRepeat["type"]; label: string }[] = [
  { value: "daily", label: "매일" },
  { value: "weekly", label: "매주" },
  { value: "monthly", label: "매월" },
  { value: "yearly", label: "매년" },
];

const DAILY_DAYS = [
  { value: "all", label: "매일" },
  { value: "weekdays", label: "평일" },
  { value: "weekends", label: "주말" },
] as const;

/** 하나만 고르는 버튼 묶음 */
function Segmented<T>({
  options,
  isSelected,
  onSelect,
}: {
  options: { key: string; label: string; value: T }[];
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <div className={styles.segmented} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={isSelected(o.value)}
          className={`${styles.segment}${isSelected(o.value) ? ` ${styles.segmentActive}` : ""}`}
          onClick={() => onSelect(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IntervalInput({
  value,
  max,
  unit,
  onChange,
}: {
  value: number;
  max: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className={styles.repeatIntervalControl}>
      <input
        className={styles.formInput}
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.min(max, Math.max(1, Number(e.target.value) || 1)))
        }
      />
      <span>{unit}마다</span>
    </label>
  );
}

/**
 * 반복 규칙 입력. 종류(매일·매주·매월·매년)에 따라 옆 조건이 바뀐다.
 * 마감일(anchor)에서 기본값을 뽑고, 첫 회차를 아래에 한 줄로 보여 준다.
 */
export default function RepeatEditor({
  repeat,
  anchor,
  dueDate,
  firstDate,
  onChange,
}: {
  repeat: TodoRepeat;
  /** 마감일(없으면 오늘) — 매월 날짜·N번째 요일, 매년 월·일을 여기서 뽑는다 */
  anchor: string;
  /** 폼에 적힌 마감일(비어 있을 수 있음) */
  dueDate: string;
  /** 저장하면 마감일이 될 첫 회차 */
  firstDate: string;
  onChange: (repeat: TodoRepeat) => void;
}) {
  const first = new Date(`${firstDate}T00:00:00`);
  const firstLabel = first.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div className={styles.repeatEditor}>
      <div className={styles.repeatControls}>
        <select
          className={styles.formInput}
          value={repeat.type}
          onChange={(e) =>
            onChange(
              defaultRepeat(e.target.value as TodoRepeat["type"], anchor),
            )
          }
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {repeat.type === "daily" && (
          <Segmented
            options={DAILY_DAYS.map((d) => ({ key: d.value, ...d }))}
            isSelected={(v) => repeat.days === v}
            onSelect={(days) => onChange({ ...repeat, days })}
          />
        )}
        {repeat.type === "weekly" && (
          <IntervalInput
            value={repeat.interval}
            max={52}
            unit="주"
            onChange={(interval) => onChange({ ...repeat, interval })}
          />
        )}
        {repeat.type === "monthly" && (
          <IntervalInput
            value={repeat.interval}
            max={12}
            unit="개월"
            onChange={(interval) => onChange({ ...repeat, interval })}
          />
        )}
        {repeat.type === "yearly" && (
          <span className={styles.repeatFixed}>
            {repeat.month}월 {repeat.day}일 (마감일 기준)
          </span>
        )}
      </div>

      {repeat.type === "weekly" && (
        <div className={styles.weekdayChips}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const on = repeat.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                className={`${styles.weekdayChip}${on ? ` ${styles.weekdayChipActive}` : ""}${d === 0 ? ` ${styles.weekdayChipSun}` : ""}`}
                onClick={() => {
                  // 마지막 하나는 끌 수 없다(아무 요일도 아닌 반복은 없다)
                  if (on && repeat.weekdays.length === 1) return;
                  const weekdays = on
                    ? repeat.weekdays.filter((w) => w !== d)
                    : [...repeat.weekdays, d].sort((a, b) => a - b);
                  onChange({ ...repeat, weekdays });
                }}
              >
                {weekdayName(d)}
              </button>
            );
          })}
        </div>
      )}

      {repeat.type === "monthly" && (
        <Segmented
          options={monthlyOptions(anchor).map((on) => ({
            key: JSON.stringify(on),
            label: monthlyOnLabel(on),
            value: on,
          }))}
          isSelected={(on) => JSON.stringify(on) === JSON.stringify(repeat.on)}
          onSelect={(on) => onChange({ ...repeat, on })}
        />
      )}

      <p className={styles.repeatSummary}>
        {firstDate === dueDate
          ? `${firstLabel}부터`
          : `마감일을 ${firstLabel}로 맞춰 저장`}{" "}
        · {repeatLabel(repeat)}
      </p>
    </div>
  );
}
