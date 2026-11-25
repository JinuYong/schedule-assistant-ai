// 숫자 속성 입력: 숫자가 아닌 글자는 칸에 아예 안 들어가게 한다.

/**
 * 입력한 글자에서 숫자로 쓸 수 있는 것만 남긴다 — 맨 앞 "-" 하나, 첫 "." 하나, 숫자.
 * 전각 숫자("１２")는 반각으로, 자릿수 쉼표("1,000")는 뺀다.
 */
export function cleanNumberInput(raw: string): string {
  let out = "";
  let dot = false;
  for (const ch of raw.normalize("NFKC").replace(/,/g, "")) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "-" && out === "") out += ch;
    else if (ch === "." && !dot) {
      dot = true;
      out += ch;
    }
  }
  return out;
}

/** 정리한 글자를 숫자로. 비었거나 아직 쓰는 중("-", ".")이면 undefined */
export function parseNumberInput(text: string): number | undefined {
  if (!/\d/.test(text)) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}
