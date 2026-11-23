// 선택·다중 선택 값: 칸을 누르면 노션처럼 검색 + 고르기 + 새로 만들기 창이 뜬다.

import { useState, type RefObject } from "react";
import type { MemoProperty, MemoValue } from "@cali/shared";
import { IconClose } from "@/components/icons";
import { useMemosStore } from "@/store/memos";
import { newOption, optionClass } from "../memo-labels";
import { OptionRow } from "./option-menu";
import Popover, { MenuLabel, usePopover } from "./popover";
import styles from "./property.module.css";

const selectedIds = (property: MemoProperty, value: MemoValue | undefined) => {
  const ids = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  return ids.filter((id) => property.options.some((o) => o.id === id));
};

export default function SelectField({
  property,
  value,
  onChange,
}: {
  property: MemoProperty;
  value: MemoValue | undefined;
  onChange: (value: MemoValue | undefined) => void;
}) {
  const [popRef, pop] = usePopover<HTMLDivElement>();
  const ids = selectedIds(property, value);
  const chosen = ids.map((id) => property.options.find((o) => o.id === id)!);

  return (
    <>
      <div
        ref={popRef}
        role="button"
        tabIndex={0}
        className={`${styles.value} ${styles.selectValue}${pop.open ? ` ${styles.valueOpen}` : ""}`}
        onClick={pop.toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pop.toggle();
          }
        }}
      >
        {chosen.length ? (
          chosen.map((o) => (
            <span key={o.id} className={optionClass(o.color)}>
              {o.name}
            </span>
          ))
        ) : (
          <span className={styles.placeholder}>비어 있음</span>
        )}
      </div>
      {pop.open && (
        <SelectPopover
          anchor={popRef}
          property={property}
          ids={ids}
          onChange={onChange}
          onClose={pop.close}
        />
      )}
    </>
  );
}

function SelectPopover({
  anchor,
  property,
  ids,
  onChange,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  property: MemoProperty;
  ids: string[];
  onChange: (value: MemoValue | undefined) => void;
  onClose: () => void;
}) {
  const updateProperty = useMemosStore((s) => s.updateProperty);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const multi = property.type === "multiSelect";

  const q = text.trim().toLowerCase();
  const matches = property.options.filter((o) =>
    o.name.toLowerCase().includes(q),
  );
  const canCreate =
    q !== "" && !property.options.some((o) => o.name.toLowerCase() === q);
  const count = matches.length + (canCreate ? 1 : 0);
  const chosen = ids.map((id) => property.options.find((o) => o.id === id)!);

  const set = (next: string[]) =>
    onChange(next.length === 0 ? undefined : multi ? next : next[0]);

  const pick = (id: string) => {
    setText("");
    setActive(0);
    if (!multi) {
      set(ids.includes(id) ? [] : [id]);
      return onClose();
    }
    set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  const create = async () => {
    const option = newOption(text.trim(), property.options);
    setText("");
    setActive(0);
    // 선택지가 서버에 먼저 있어야 값이 저장 때 걸러지지 않는다
    const ok = await updateProperty(property.id, {
      options: [...property.options, option],
    });
    if (!ok) return;
    set(multi ? [...ids, option.id] : [option.id]);
    if (!multi) onClose();
  };

  const choose = (i: number) =>
    i < matches.length ? pick(matches[i]!.id) : void create();

  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <div className={styles.tagBox}>
        {chosen.map((o) => (
          <span key={o.id} className={`${optionClass(o.color)} ${styles.tag}`}>
            {o.name}
            <button
              type="button"
              title="빼기"
              onClick={() => set(ids.filter((x) => x !== o.id))}
            >
              <IconClose />
            </button>
          </span>
        ))}
        <input
          autoFocus
          className={styles.tagInput}
          value={text}
          maxLength={100}
          placeholder={chosen.length ? "" : "선택지 검색 또는 만들기"}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (count)
                setActive(
                  (a) => (a + (e.key === "ArrowDown" ? 1 : count - 1)) % count,
                );
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (count) choose(Math.min(active, count - 1));
            } else if (e.key === "Backspace" && !text && ids.length) {
              set(ids.slice(0, -1));
            }
          }}
        />
      </div>

      <MenuLabel>
        {property.options.length || canCreate
          ? multi
            ? "선택지를 고르거나 만드세요 (여러 개)"
            : "선택지를 고르거나 만드세요"
          : "이름을 입력해 선택지를 만드세요"}
      </MenuLabel>
      {matches.map((o, i) => (
        <OptionRow
          key={o.id}
          property={property}
          option={o}
          selected={ids.includes(o.id)}
          active={i === active}
          onHover={() => setActive(i)}
          onPick={() => pick(o.id)}
        />
      ))}
      {canCreate && (
        <button
          type="button"
          className={`${styles.createRow}${active === matches.length ? ` ${styles.optionRowActive}` : ""}`}
          onMouseEnter={() => setActive(matches.length)}
          onClick={() => void create()}
        >
          <span>만들기</span>
          <span
            className={optionClass(
              newOption(text.trim(), property.options).color,
            )}
          >
            {text.trim()}
          </span>
        </button>
      )}
    </Popover>
  );
}
