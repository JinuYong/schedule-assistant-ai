import type { RefObject } from "react";
import {
  memoOptionColors,
  type MemoProperty,
  type MemoSelectOption,
} from "@cali/shared";
import { IconCheck, IconMore, IconTrash } from "@/components/icons";
import { useMemosStore } from "@/store/memos";
import { OPTION_COLOR_LABELS, optionClass } from "../memo-labels";
import { useConfirm } from "../use-confirm";
import CommitInput from "./commit-input";
import Popover, {
  MenuDivider,
  MenuItem,
  MenuLabel,
  usePopover,
} from "./popover";
import styles from "./property.module.css";

/** 선택지 하나 고치기: 이름 · 지우기 · 색 */
function OptionMenu({
  property,
  option,
  anchor,
  onClose,
}: {
  property: MemoProperty;
  option: MemoSelectOption;
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const updateProperty = useMemosStore((s) => s.updateProperty);
  const remove = useConfirm();
  const setOption = (patch: Partial<MemoSelectOption>) =>
    void updateProperty(property.id, {
      options: property.options.map((o) =>
        o.id === option.id ? { ...o, ...patch } : o,
      ),
    });

  return (
    <Popover anchor={anchor} onClose={onClose} width={220}>
      <div className={styles.menuPad}>
        <CommitInput
          autoFocus
          value={option.name}
          onCommit={(name) => setOption({ name })}
        />
      </div>
      <MenuItem
        icon={<IconTrash />}
        danger
        onClick={() =>
          remove.ask(() => {
            onClose();
            void updateProperty(property.id, {
              options: property.options.filter((o) => o.id !== option.id),
            });
          })
        }
      >
        {remove.confirming ? "한 번 더 누르면 지워요" : "지우기"}
      </MenuItem>
      <MenuDivider />
      <MenuLabel>색</MenuLabel>
      {memoOptionColors.map((c) => (
        <MenuItem
          key={c}
          icon={<span className={`${optionClass(c)} ${styles.swatch}`} />}
          trailing={c === option.color ? <IconCheck /> : undefined}
          onClick={() => setOption({ color: c })}
        >
          {OPTION_COLOR_LABELS[c]}
        </MenuItem>
      ))}
    </Popover>
  );
}

/**
 * 선택지 한 줄: 칩 + (마우스를 올리면) ⋯ 버튼으로 고치기.
 * onPick이 있으면 줄을 눌러 고른다(값 고르는 창), 없으면 보여 주기만(속성 메뉴).
 */
export function OptionRow({
  property,
  option,
  selected,
  active,
  onPick,
  onHover,
}: {
  property: MemoProperty;
  option: MemoSelectOption;
  selected?: boolean;
  active?: boolean;
  onPick?: () => void;
  onHover?: () => void;
}) {
  const [menuRef, menu] = usePopover();
  return (
    <div
      className={`${styles.optionRow}${active || menu.open ? ` ${styles.optionRowActive}` : ""}`}
      onMouseEnter={onHover}
    >
      <button
        type="button"
        className={styles.optionMain}
        disabled={!onPick}
        onClick={onPick}
      >
        <span className={optionClass(option.color)}>{option.name}</span>
        {selected && (
          <span className={styles.optionCheck}>
            <IconCheck />
          </span>
        )}
      </button>
      <button
        ref={menuRef}
        type="button"
        className={styles.optionMore}
        title="선택지 고치기"
        onClick={menu.toggle}
      >
        <IconMore />
      </button>
      {menu.open && (
        <OptionMenu
          property={property}
          option={option}
          anchor={menuRef}
          onClose={menu.close}
        />
      )}
    </div>
  );
}
