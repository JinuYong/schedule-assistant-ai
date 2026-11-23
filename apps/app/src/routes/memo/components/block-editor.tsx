// BlockNote 본문 편집기. 메모 화면과 함께 지연 로드된다(첫 화면 번들에 안 실음).
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { ko } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";
import styles from "../page.module.css";

// 파일을 둘 서버 저장소가 아직 없어 이미지·영상·소리·파일 블록은 뺀다(슬래시 메뉴에서도 사라진다)
const {
  paragraph,
  heading,
  quote,
  bulletListItem,
  numberedListItem,
  checkListItem,
  toggleListItem,
  codeBlock,
  table,
  divider,
} = defaultBlockSpecs;
const schema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph,
    heading,
    quote,
    bulletListItem,
    numberedListItem,
    checkListItem,
    toggleListItem,
    codeBlock,
    table,
    divider,
  },
});

export default function BlockEditor({
  initialContent,
  onChange,
}: {
  /** 처음 내용. 바뀌어도 다시 읽지 않는다 — 메모가 바뀌면 key로 새로 만든다 */
  initialContent: unknown[];
  onChange: (content: unknown[]) => void;
}) {
  const editor = useCreateBlockNote({
    schema,
    dictionary: ko,
    // 빈 배열은 BlockNote가 받지 않는다(빈 문단 하나로 시작)
    initialContent: initialContent.length
      ? (initialContent as (typeof schema.PartialBlock)[])
      : undefined,
  });

  return (
    <BlockNoteView
      className={styles.blockEditor}
      editor={editor}
      theme="light"
      onChange={() => onChange(editor.document)}
    />
  );
}
