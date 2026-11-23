import { useEffect, useRef, useState } from "react";
import { MenuInput } from "./popover";

/** 같은 글자를 두 번 보내지 않게 마지막으로 보낸 값을 기억한다 */
function commit(
  sent: { current: string },
  text: string,
  current: string,
  send: (value: string) => void,
) {
  const t = text.trim();
  if (!t || t === current || t === sent.current) return;
  sent.current = t;
  send(t);
}

/**
 * 바뀐 글자를 Enter나 칸을 떠날 때 올리는 입력(비우면 원래대로).
 * 팝오버 바깥을 눌러 창째 닫히면 blur가 안 오므로 사라질 때도 올린다.
 */
export default function CommitInput({
  value,
  onCommit,
  placeholder,
  autoFocus,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(value);
  // 서버에서 값이 바뀌면(다른 곳에서 고침) 입력도 따라간다
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }

  const sent = useRef(value);
  const latest = useRef({ text, value, onCommit });
  useEffect(() => {
    latest.current = { text, value, onCommit };
  });
  useEffect(
    () => () => {
      const l = latest.current;
      commit(sent, l.text, l.value, l.onCommit);
    },
    [],
  );

  return (
    <MenuInput
      value={text}
      placeholder={placeholder}
      maxLength={100}
      autoFocus={autoFocus}
      onFocus={(e) => autoFocus && e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (!text.trim()) setText(value);
        else commit(sent, text, value, onCommit);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (!text.trim()) setText(value);
          else commit(sent, text, value, onCommit);
        }
      }}
    />
  );
}
