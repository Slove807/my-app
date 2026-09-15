import { readFile } from "node:fs/promises";
import path from "node:path";
import { MANUAL_META_FILE } from "./config";
import type { RevisionInfo } from "./types";

/**
 * 스캔(이미지)으로만 된 PDF는 본문에 글자가 한 자도 없어 어떤 규칙으로도 ★기본정보를
 * 뽑을 수 없다. 이런 문서는 담당자가 `data/manual-meta.json`에 직접 적어 두고,
 * 여기서 읽어 채운다. 사람이 원문을 보고 옮겨 적은 값이므로 본문에서 읽은 값보다 우선한다.
 *
 * 형식 (키는 파일명):
 * {
 *   "MT22-00571_Coupling Fluid Accelerated aging Report.pdf": {
 *     "equipmentName": "Gel for medical use. non-sterilized",
 *     "model": "Coupling fluid",
 *     "reportNo": "MT22-00571",
 *     "revisionNo": "0",
 *     "revisionDate": "2023-01-10",
 *     "testingLab": "KCL",
 *     "appliedStandard": "ASTM F1980-21"
 *   }
 * }
 */
export type ManualMeta = Partial<
  Pick<
    RevisionInfo,
    | "equipmentName"
    | "model"
    | "reportNo"
    | "revisionNo"
    | "revisionDate"
    | "testingLab"
    | "appliedStandard"
    | "reasonForIssue"
  >
> & { categoryLabel?: string };

type ManualMetaFile = Record<string, ManualMeta>;

export async function readManualMetaFile(): Promise<ManualMetaFile> {
  try {
    return JSON.parse(await readFile(MANUAL_META_FILE, "utf8")) as ManualMetaFile;
  } catch {
    return {};
  }
}

/** 파일명으로 직접 입력해 둔 값을 찾는다 (경로가 달라도 파일명이 같으면 같은 문서로 본다) */
export async function findManualMeta(originalName: string): Promise<ManualMeta | null> {
  const entries = await readManualMetaFile();
  const key = path.basename(originalName);
  return entries[key] ?? null;
}

/** 직접 입력한 값을 본문에서 읽은 정보 위에 덮어쓴다. 비어 있는 항목은 그대로 둔다 */
export function applyManualMeta(info: RevisionInfo, manual: ManualMeta): RevisionInfo {
  return {
    ...info,
    equipmentName: manual.equipmentName ?? info.equipmentName,
    model: manual.model ?? info.model,
    reportNo: manual.reportNo ?? info.reportNo,
    revisionNo: manual.revisionNo ?? info.revisionNo,
    revisionDate: manual.revisionDate ?? info.revisionDate,
    testingLab: manual.testingLab ?? info.testingLab,
    appliedStandard: manual.appliedStandard ?? info.appliedStandard,
    reasonForIssue: manual.reasonForIssue ?? info.reasonForIssue,
  };
}
