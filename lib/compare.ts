import { diffLines } from "diff";

export type DiffItem = {
  /** 그 내용이 속한 조항 (예: 제5조, 17). 찾지 못하면 "조항 미상" */
  clause: string;
  kind: "changed" | "added" | "removed";
  before: string;
  after: string;
};

export type TextComparison = {
  items: DiffItem[];
  addedCount: number;
  removedCount: number;
  identical: boolean;
};

// 국문 규정의 "제5조"와 시험성적서의 "4.2", "11.7" 조항 번호를 모두 인식한다
const CLAUSE_PATTERNS = [
  /^(제\s*[0-9]+\s*(?:조|장|절)(?:\s*의\s*[0-9]+)?)/,
  /^([0-9]{1,2}(?:\.[0-9]{1,3}){0,3})\s+[A-Za-z가-힣]/,
];

// 표지·머리말 정보는 개정 정보로 따로 표시하므로 변경 항목에서 제외한다
const METADATA_PATTERN =
  /^(?:문서\s*번호|개정\s*(?:번호|차수|일자|일)|시행\s*(?:일자|일)|제정\s*(?:일자|일)|Rev\.?|Version)\s*[:：]|^(?:Report Number|Date of issue|Total number of pages|Master TRF|TRF template used|Test Report Form No\.|Test Report Form\(s\) Originator|Page\s+[0-9]+\s+of\s+[0-9]+)[.\s]*[:：]?/i;

// 서명자·승인자 표기 차이는 실질적 변경이 아니므로 화면에서 뒤로 미룬다
const ADMIN_NOISE_PATTERN =
  /^(?:Tested by|Approved by|Witnessed by|Testing location|Date of receipt of test item|Date\s*\(s\)\s*of performance of tests)/i;

const UNCLASSIFIED_CLAUSE = "조항 미상";

/**
 * 이전 버전과 새 버전의 본문을 줄 단위로 비교한다.
 * diff가 만든 각 블록(hunk) 안에서만 이전/변경 줄을 짝짓는다 — 문서 전체를 훑어
 * 전역 인덱스로 짝지으면 서로 무관한 변경끼리 엮여 엉뚱하게 표시되기 때문이다.
 */
export function compareTexts(oldText: string, newText: string): TextComparison {
  const changes = diffLines(oldText, newText);
  const oldClauses = mapLinesToClause(oldText);
  const newClauses = mapLinesToClause(newText);

  const rawItems: DiffItem[] = [];
  let addedCount = 0;
  let removedCount = 0;

  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i];
    if (!change.added && !change.removed) continue;

    if (change.removed) {
      const removedLines = cleanLines(change.value);
      removedCount += removedLines.length;

      const next = changes[i + 1];
      if (next?.added) {
        // 같은 자리에서 삭제→추가가 바로 이어지면 "문구가 바뀐 것"으로 보고,
        // 이 블록 안에서만 줄을 짝짓는다 (다른 블록과 섞지 않는다).
        const addedLines = cleanLines(next.value);
        addedCount += addedLines.length;
        const max = Math.max(removedLines.length, addedLines.length);

        for (let j = 0; j < max; j += 1) {
          const before = removedLines[j] ?? "";
          const after = addedLines[j] ?? "";
          const clause =
            (before && oldClauses.get(before)) ||
            (after && newClauses.get(after)) ||
            UNCLASSIFIED_CLAUSE;
          rawItems.push({
            clause,
            kind: before && after ? "changed" : after ? "added" : "removed",
            before,
            after,
          });
        }
        i += 1; // 다음 added 블록은 이미 처리했으므로 건너뛴다
        continue;
      }

      for (const line of removedLines) {
        rawItems.push({
          clause: oldClauses.get(line) ?? UNCLASSIFIED_CLAUSE,
          kind: "removed",
          before: line,
          after: "",
        });
      }
      continue;
    }

    // 짝이 되는 삭제 블록 없이 순수하게 추가된 경우
    const addedLines = cleanLines(change.value);
    addedCount += addedLines.length;
    for (const line of addedLines) {
      rawItems.push({
        clause: newClauses.get(line) ?? UNCLASSIFIED_CLAUSE,
        kind: "added",
        before: "",
        after: line,
      });
    }
  }

  return {
    items: mergeAdjacent(rawItems),
    addedCount,
    removedCount,
    identical: addedCount === 0 && removedCount === 0,
  };
}

function cleanLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !METADATA_PATTERN.test(line));
}

/** 같은 조항·같은 종류로 연이어 끊긴 줄들을 한 문단으로 합쳐 읽기 쉽게 만든다 */
function mergeAdjacent(items: DiffItem[]): DiffItem[] {
  const merged: DiffItem[] = [];

  for (const item of items) {
    const prev = merged.at(-1);
    if (prev && prev.clause === item.clause && prev.kind === item.kind) {
      prev.before = [prev.before, item.before].filter(Boolean).join(" ");
      prev.after = [prev.after, item.after].filter(Boolean).join(" ");
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}

/** 실질적인 변경(조항 번호가 있는 항목)을 서명·승인 표기 같은 잡음보다 앞에 둔다 */
export function prioritizeItems(items: DiffItem[]): DiffItem[] {
  const score = (item: DiffItem): number => {
    if (item.clause !== UNCLASSIFIED_CLAUSE && !ADMIN_NOISE_PATTERN.test(item.before || item.after)) {
      return 0;
    }
    if (ADMIN_NOISE_PATTERN.test(item.before || item.after)) return 2;
    return 1;
  };

  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.item);
}

/** 각 줄이 어느 조항 아래에 있는지 표로 만든다 */
function mapLinesToClause(text: string): Map<string, string> {
  const map = new Map<string, string>();
  let current = "";

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const clause = matchClause(line);
    if (clause) current = clause;
    if (current && !map.has(line)) map.set(line, current);
  }

  return map;
}

function matchClause(line: string): string | null {
  for (const pattern of CLAUSE_PATTERNS) {
    const found = line.match(pattern);
    if (found) return found[1].replace(/\s+/g, "");
  }
  return null;
}

/** 변경된 항목들을 AI에게 넘길 텍스트로 정리한다 */
export function formatComparisonForPrompt(
  comparison: TextComparison,
  limit = 80,
): string {
  const ordered = prioritizeItems(comparison.items).slice(0, limit);
  const lines: string[] = [];

  for (const item of ordered) {
    if (item.kind === "changed") {
      lines.push(`- (${item.clause}) 이전: ${item.before} → 변경: ${item.after}`);
    } else if (item.kind === "added") {
      lines.push(`- (${item.clause}) 추가됨: ${item.after}`);
    } else {
      lines.push(`- (${item.clause}) 삭제됨: ${item.before}`);
    }
  }

  return lines.join("\n");
}
