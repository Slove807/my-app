import path from "node:path";
import type { DocRecord } from "./types";
import { latestVersion, orderVersions } from "./versions";

export type LookupResult =
  | { kind: "matched"; record: DocRecord }
  | { kind: "ambiguous"; candidates: DocRecord[] }
  | { kind: "none" };

/** 질문에 등장한 문서명을 보관 중인 문서와 맞춰본다 */
export function findDocument(records: DocRecord[], question: string): LookupResult {
  if (records.length === 0) return { kind: "none" };

  const target = normalize(question);
  const scored = records
    .map((record) => ({ record, score: scoreRecord(record, target) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  // 문서명을 언급하지 않았어도 보관 문서가 하나뿐이면 그 문서로 본다
  if (scored.length === 0) {
    return records.length === 1
      ? { kind: "matched", record: records[0] }
      : { kind: "none" };
  }

  const best = scored[0];
  const tied = scored.filter((entry) => entry.score === best.score);
  if (tied.length > 1) {
    return { kind: "ambiguous", candidates: tied.map((entry) => entry.record) };
  }

  return { kind: "matched", record: best.record };
}

/** AI 없이도 답할 수 있는 최신 변경 내역 정리 */
export function describeLatestChange(record: DocRecord): string {
  const ordered = orderVersions(record.versions);
  const latest = ordered.at(-1);
  if (!latest) return `'${record.title}' 문서에 보관된 버전이 없습니다.`;

  // 내부 저장 번호는 훑은 순서를 따르므로, 개정 순서를 기준으로 다시 매긴 번호를 답변에 쓴다
  const displayNo = new Map(ordered.map((version, index) => [version.version, index + 1]));
  const label = (versionNo: number) => displayNo.get(versionNo) ?? versionNo;

  const head = `'${record.title}'의 최신 버전은 v${label(latest.version)}입니다. (개정번호 ${latest.revisionNo ?? "없음"} / 개정일자 ${latest.revisionDate ?? "없음"})`;

  if (!latest.changeSummary) {
    return `${head}\n\n첫 번째로 보관된 버전이라 비교할 이전 문서가 없습니다.`;
  }

  const summary = latest.changeSummary;
  const compared = summary.comparedWith;
  const lines = [
    head,
    `비교 대상: v${label(compared.version)} (개정번호 ${compared.revisionNo ?? "없음"} / 개정일자 ${compared.revisionDate ?? "없음"})`,
    "",
  ];

  if (summary.reasonForIssue) {
    lines.push(`발행 및 개정사유(문서에 명시된 근거): ${summary.reasonForIssue}`, "");
  }

  lines.push(`변경 요약: ${summary.headline}`, "");

  if (summary.caveat) {
    lines.push(`※ ${summary.caveat}`, "");
  }

  for (const item of summary.items) {
    lines.push(`- [${item.clause}] ${item.summary}`);
    if (item.before) lines.push(`    이전: ${item.before}`);
    if (item.after) lines.push(`    변경: ${item.after}`);
  }

  lines.push("", `근거: ${record.title} v${label(latest.version)}`);
  return lines.join("\n");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function scoreRecord(record: DocRecord, target: string): number {
  const latest = latestVersion(record);
  const candidates = [
    record.title,
    record.key,
    ...(record.aliases ?? []),
    latest ? path.basename(latest.originalName, path.extname(latest.originalName)) : "",
  ].filter(Boolean);

  let score = 0;

  for (const candidate of candidates) {
    // 문서명 전체가 질문에 들어 있으면 가장 확실한 근거다
    const whole = normalize(candidate);
    if (whole.length >= 2 && target.includes(whole)) {
      score = Math.max(score, whole.length * 2);
    }

    for (const token of candidate.split(/[^0-9A-Za-z가-힣]+/)) {
      const normalized = normalize(token);
      if (normalized.length >= 2 && target.includes(normalized)) {
        score += normalized.length;
      }
    }
  }

  return score;
}
