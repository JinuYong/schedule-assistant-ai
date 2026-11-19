import { useEffect, useState } from "react";
import type { TodoList } from "@cali/shared";
import { useTodosStore } from "@/store/todos";
import { IconPencil, IconPlus, IconTrash } from "@/components/icons";
import ListNameInput from "./list-name-input";
import styles from "../page.module.css";

/** 지우기 버튼을 한 번 누르면 이 시간 동안 "한 번 더"를 기다린다 */
const CONFIRM_MS = 3000;

/**
 * 목록 머리: 이름 + [추가] + 호버 시 이름 바꾸기·지우기.
 * 지우기는 안의 할일까지 사라지므로 두 번 눌러야 한다(확인 창 대신).
 */
export default function ListHeader({
  list,
  count,
  canDelete,
  onAdd,
}: {
  list: TodoList;
  /** 목록 안 미완료 할일 수 — 지우기 확인 문구에 쓴다 */
  count: number;
  /** 마지막 목록은 못 지운다(지우면 서버가 빈 기본 목록을 다시 만든다) */
  canDelete: boolean;
  onAdd: () => void;
}) {
  const renameList = useTodosStore((s) => s.renameList);
  const deleteList = useTodosStore((s) => s.deleteList);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <div className={styles.listHeader}>
      {renaming ? (
        <ListNameInput
          initial={list.name}
          placeholder="목록 이름"
          onSave={(name) => renameList(list.id, name)}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <h2 className={styles.listName}>{list.name}</h2>
      )}
      <div className={styles.listActions}>
        {!renaming && (
          <div className={styles.listHoverActions}>
            <button
              className={styles.actionBtn}
              onClick={() => setRenaming(true)}
              title="이름 바꾸기"
            >
              <IconPencil />
            </button>
            {canDelete && !confirming && (
              <button
                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                onClick={() => setConfirming(true)}
                title="목록 지우기"
              >
                <IconTrash />
              </button>
            )}
          </div>
        )}
        {confirming && (
          <button
            className={styles.confirmDeleteBtn}
            onClick={() => void deleteList(list.id)}
          >
            {count > 0 ? `할일 ${count}개와 함께 지우기` : "목록 지우기"}
          </button>
        )}
        <button className={styles.addBtn} onClick={onAdd}>
          <IconPlus size={11} /> 추가
        </button>
      </div>
    </div>
  );
}
