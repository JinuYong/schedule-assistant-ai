import type { Memo, MemoProperty, MemoValue } from "@cali/shared";
import { IconPlus, IconTrash } from "@/components/icons";
import { useMemosStore, type MemoSaveState } from "@/store/memos";
import { useConfirm } from "../use-confirm";
import BlockEditor from "./block-editor";
import { usePopover } from "./popover";
import PropertyField from "./property-field";
import { AddPropertyMenu, PropertyMenu } from "./property-menu";
import PropertyTypeIcon from "./property-type-icon";
import styles from "../page.module.css";
import ps from "./property.module.css";

const SAVE_LABELS: Record<MemoSaveState, string> = {
  idle: "",
  saving: "저장 중…",
  saved: "저장됨",
  error: "저장하지 못했습니다",
};

/** 편집 중인 메모. 메모가 바뀌면 부모가 key로 새로 만든다 */
export default function MemoEditor({
  memo,
  properties,
  saveState,
  onEdit,
  onDelete,
}: {
  memo: Memo;
  properties: MemoProperty[];
  saveState: MemoSaveState;
  onEdit: (patch: Partial<Pick<Memo, "title" | "content" | "values">>) => void;
  onDelete: () => void;
}) {
  const remove = useConfirm();
  const [addMenuRef, addMenu] = usePopover();

  // 값을 고르는 창은 비동기(선택지 만들기)라 그사이 바뀐 값 위에 얹는다
  const setValue = (propertyId: number, value: MemoValue | undefined) => {
    const values = {
      ...(useMemosStore.getState().current?.values ?? memo.values),
    };
    if (value === undefined) delete values[String(propertyId)];
    else values[String(propertyId)] = value;
    onEdit({ values });
  };

  const updated = new Date(memo.updatedAt).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className={styles.editor}>
      <div className={styles.editorTop}>
        <span
          className={`${styles.saveState}${saveState === "error" ? ` ${styles.saveError}` : ""}`}
        >
          {SAVE_LABELS[saveState] || `${updated} 수정`}
        </span>
        <button
          type="button"
          className={`${styles.deleteBtn}${remove.confirming ? ` ${styles.deleteConfirm}` : ""}`}
          title="메모 지우기"
          onClick={() => remove.ask(onDelete)}
        >
          <IconTrash />
          {remove.confirming && <span>한 번 더 누르면 지워요</span>}
        </button>
      </div>

      <input
        className={styles.titleInput}
        value={memo.title}
        placeholder="제목 없음"
        maxLength={500}
        onChange={(e) => onEdit({ title: e.target.value })}
      />

      <div className={ps.properties}>
        {properties.map((p) => (
          <PropertyRow
            key={p.id}
            property={p}
            value={memo.values[String(p.id)]}
            onChange={(value) => setValue(p.id, value)}
          />
        ))}
        <button
          ref={addMenuRef}
          type="button"
          className={ps.addProperty}
          onClick={addMenu.toggle}
        >
          <IconPlus size={11} /> 속성 추가
        </button>
        {addMenu.open && (
          <AddPropertyMenu anchor={addMenuRef} onClose={addMenu.close} />
        )}
      </div>

      <BlockEditor
        initialContent={memo.content}
        onChange={(content) => onEdit({ content })}
      />
    </div>
  );
}

/** 노션처럼: 왼쪽 이름(누르면 속성 메뉴) + 오른쪽 값 */
function PropertyRow({
  property,
  value,
  onChange,
}: {
  property: MemoProperty;
  value: MemoValue | undefined;
  onChange: (value: MemoValue | undefined) => void;
}) {
  const [menuRef, menu] = usePopover();
  return (
    <div className={ps.row}>
      <button
        ref={menuRef}
        type="button"
        className={`${ps.name}${menu.open ? ` ${ps.nameOpen}` : ""}`}
        onClick={menu.toggle}
      >
        <PropertyTypeIcon type={property.type} />
        <span>{property.name}</span>
      </button>
      {menu.open && (
        <PropertyMenu
          property={property}
          anchor={menuRef}
          onClose={menu.close}
        />
      )}
      <PropertyField property={property} value={value} onChange={onChange} />
    </div>
  );
}
