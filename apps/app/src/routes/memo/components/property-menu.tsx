// 속성 이름을 누르면 뜨는 창(이름 바꾸기 · 선택지 관리 · 지우기)과 "속성 추가" 창.

import { useState, type RefObject } from "react";
import {
  memoPropertyTypes,
  type MemoProperty,
  type MemoPropertyType,
} from "@cali/shared";
import { IconTrash } from "@/components/icons";
import { useMemosStore } from "@/store/memos";
import { PROPERTY_TYPE_LABELS, hasOptions, newOption } from "../memo-labels";
import { useConfirm } from "../use-confirm";
import CommitInput from "./commit-input";
import { OptionRow } from "./option-menu";
import Popover, {
  MenuDivider,
  MenuInput,
  MenuItem,
  MenuLabel,
} from "./popover";
import PropertyTypeIcon from "./property-type-icon";
import styles from "./property.module.css";

export function PropertyMenu({
  property,
  anchor,
  onClose,
}: {
  property: MemoProperty;
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const updateProperty = useMemosStore((s) => s.updateProperty);
  const deleteProperty = useMemosStore((s) => s.deleteProperty);
  const remove = useConfirm();
  const [newName, setNewName] = useState("");

  const addOption = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    if (property.options.some((o) => o.name === name)) return;
    void updateProperty(property.id, {
      options: [...property.options, newOption(name, property.options)],
    });
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div className={styles.menuPad}>
        <CommitInput
          autoFocus
          value={property.name}
          onCommit={(name) => void updateProperty(property.id, { name })}
        />
      </div>
      <MenuItem
        icon={<PropertyTypeIcon type={property.type} />}
        trailing={PROPERTY_TYPE_LABELS[property.type]}
        title="종류는 만든 뒤 바꿀 수 없어요"
        disabled
      >
        종류
      </MenuItem>

      {hasOptions(property.type) && (
        <>
          <MenuDivider />
          <MenuLabel>선택지</MenuLabel>
          {property.options.map((o) => (
            <OptionRow key={o.id} property={property} option={o} />
          ))}
          <div className={styles.menuPad}>
            <MenuInput
              value={newName}
              placeholder="선택지 추가 (Enter)"
              maxLength={100}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addOption();
                }
              }}
            />
          </div>
        </>
      )}

      <MenuDivider />
      <MenuItem
        icon={<IconTrash />}
        danger
        onClick={() =>
          remove.ask(() => {
            onClose();
            void deleteProperty(property.id);
          })
        }
      >
        {remove.confirming
          ? "한 번 더 누르면 모든 메모의 값도 사라져요"
          : "속성 지우기"}
      </MenuItem>
    </Popover>
  );
}

/** 같은 이름이 있으면 뒤에 번호를 붙인다(노션처럼 "텍스트 2") */
function uniqueName(base: string, properties: MemoProperty[]) {
  const taken = new Set(properties.map((p) => p.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function AddPropertyMenu({
  anchor,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const properties = useMemosStore((s) => s.properties);
  const createProperty = useMemosStore((s) => s.createProperty);
  const [name, setName] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  const add = async (type: MemoPropertyType) => {
    if (busy) return;
    setBusy(true);
    const ok = await createProperty({
      name: uniqueName(name.trim() || PROPERTY_TYPE_LABELS[type], properties),
      type,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width={240}>
      <div className={styles.menuPad}>
        <MenuInput
          autoFocus
          value={name}
          placeholder="속성 이름"
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            const n = memoPropertyTypes.length;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            } else if (e.key === "Enter") {
              e.preventDefault();
              void add(memoPropertyTypes[active]!);
            }
          }}
        />
      </div>
      <MenuLabel>종류</MenuLabel>
      {memoPropertyTypes.map((t, i) => (
        <MenuItem
          key={t}
          icon={<PropertyTypeIcon type={t} />}
          active={i === active}
          disabled={busy}
          onMouseEnter={() => setActive(i)}
          onClick={() => void add(t)}
        >
          {PROPERTY_TYPE_LABELS[t]}
        </MenuItem>
      ))}
      <p className={styles.menuHint}>
        모든 메모가 같은 속성을 가져요. 종류는 만든 뒤 바꿀 수 없어요.
      </p>
    </Popover>
  );
}
