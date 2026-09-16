"use client";

import { useState } from "react";
import type { ChangeSummary, DocRecord, DocVersion, SourceFilter } from "@/lib/types";
import { orderVersions } from "@/lib/versions";

type Props = {
  documents: DocRecord[];
  loading: boolean;
  sourceFilter: SourceFilter;
  onSourceFilterChange: (value: SourceFilter) => void;
};

const SOURCE_FILTER_LABEL: Record<SourceFilter, string> = {
  all: "전체 (Supabase 누적)",
  scan: "로컬 폴더 스캔",
  upload: "직접 첨부",
};

/** 문서 목록에서 쓸 유형명. 최신 버전의 시험항목(categoryLabel)을 기준으로 묶는다 */
function groupLabel(document: DocRecord): string {
  return document.versions.at(-1)?.categoryLabel ?? "미분류";
}

/** 이 필드가 생기기 전에 저장된 버전(undefined)은 전부 폴더 스캔으로 취급한다 */
function documentSource(document: DocRecord): "scan" | "upload" {
  return document.versions.at(-1)?.source ?? "scan";
}

export default function DocumentList({
  documents,
  loading,
  sourceFilter,
  onSourceFilterChange,
}: Props) {
  const [onlyChanged, setOnlyChanged] = useState(false);

  const bySource =
    sourceFilter === "all"
      ? documents
      : documents.filter((document) => documentSource(document) === sourceFilter);

  const changed = bySource.filter((document) => document.versions.length > 1);
  // 개정 이력이 있는 문서를 먼저 보여준다. 단일 버전 문서에 묻히지 않도록.
  const visible = (onlyChanged ? changed : bySource)
    .slice()
    .sort((a, b) => b.versions.length - a.versions.length);

  // 같은 유형(시험항목)끼리 묶어 드롭다운으로 펼쳐 볼 수 있게 한다
  const groups = new Map<string, DocRecord[]>();
  for (const document of visible) {
    const label = groupLabel(document);
    const bucket = groups.get(label);
    if (bucket) bucket.push(document);
    else groups.set(label, [document]);
  }
  const orderedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        문서를 불러오는 중입니다...
      </section>
    );
  }

  if (documents.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          아직 보관된 문서가 없습니다.
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          왼쪽에서 문서를 첨부하면 이곳에 버전과 변경 요약이 쌓입니다.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            보기 기준
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SOURCE_FILTER_LABEL) as SourceFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onSourceFilterChange(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  sourceFilter === value
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {SOURCE_FILTER_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            보관 문서 <strong>{bySource.length.toLocaleString()}</strong>건 · 개정 이력 있음{" "}
            <strong>{changed.length.toLocaleString()}</strong>건
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(event) => setOnlyChanged(event.target.checked)}
              className="h-4 w-4"
            />
            개정된 문서만 보기
          </label>
        </div>
      </div>

      {visible.length === 0 && (
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            이 기준에 해당하는 문서가 없습니다.
          </p>
        </section>
      )}

      {orderedGroups.map(([label, group]) => (
        <CategoryGroup key={label} label={label} documents={group} />
      ))}
    </section>
  );
}

/** 같은 유형의 문서를 드롭다운으로 묶어, 필요한 유형만 펼쳐 볼 수 있게 한다 */
function CategoryGroup({ label, documents }: { label: string; documents: DocRecord[] }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:pb-4 dark:border-slate-700 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 marker:content-none">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {documents.length.toLocaleString()}건
          </span>
          <span className="text-slate-400 transition group-open:rotate-90 dark:text-slate-500">
            ▸
          </span>
        </span>
      </summary>
      <div className="space-y-4 px-4">
        {documents.map((document) => (
          <DocumentCard key={document.key} document={document} />
        ))}
      </div>
    </details>
  );
}

function DocumentCard({ document }: { document: DocRecord }) {
  // 폴더를 훑은 순서가 아니라 개정번호 순서(Original → Amd1 → Amd2 → Amd3...)로 보여준다.
  // 내부 저장 번호(files 이름에 쓰는 v1, v2...)는 훑은 순서를 따르므로 화면 번호와 다를 수 있어,
  // 화면에는 이 개정 순서를 기준으로 다시 매긴 번호(표시번호)를 쓴다.
  const ordered = orderVersions(document.versions);
  const latest = ordered.at(-1);
  if (!latest) return null;

  const displayNo = new Map(ordered.map((version, index) => [version.version, index + 1]));

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {document.title}
        </h3>
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
          최신 v{displayNo.get(latest.version)}
        </span>
      </div>

      {latest.containsPersonalInfo && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          개인정보가 포함된 문서로 표시되었습니다.
        </p>
      )}

      {/* Original → Amd1 → Amd2 → ... 순서로, 보고서별 기본정보와 버전 사이의 비교를 이어서 보여준다 */}
      <div className="mt-4 space-y-5">
        {ordered.map((version, index) => (
          <div key={version.version}>
            <BasicInfoTable
              docKey={document.key}
              version={version}
              latest={latest}
              displayNo={displayNo.get(version.version) ?? version.version}
            />
            {index === 0 ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                가장 이전 버전이라 비교 대상이 없습니다.
              </p>
            ) : (
              <ComparisonBlock version={version} displayNo={displayNo} />
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

/** 요청하신 12개 항목(★기본정보)을 보고서 한 건 기준으로 보여준다 */
function BasicInfoTable({
  docKey,
  version,
  latest,
  displayNo,
}: {
  docKey: string;
  version: DocVersion;
  latest: DocVersion;
  displayNo: number;
}) {
  // 최신 규격은 구글 검색으로 확인해 둔 값을 쓰고, 확인하지 못했으면 적용 규격을 그대로 보여 준다
  const latestStandard =
    version.latestStandard ?? version.appliedStandard ?? latest.appliedStandard ?? null;

  const fileHref = `/api/documents/${docKey}/file?version=${version.version}`;
  const certificateHref = version.certificate
    ? `/api/documents/${docKey}/file?version=${version.version}&cert=1`
    : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        v{displayNo} 기본정보
        {version.manualEntry && (
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            담당자 직접 입력
          </span>
        )}
        {version.ocrUsed && (
          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            스캔본 OCR (오탈자 가능)
          </span>
        )}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <Meta label="★제품군" value={version.productFamily ?? "-"} />
        <Meta label="★품목명" value={version.equipmentName ?? "-"} />
        <Meta label="★모델명" value={version.model ?? "-"} />
        <Meta label="★시험항목" value={version.categoryLabel ?? "-"} />
        {version.detailedTestItem && (
          <Meta label="★상세 시험항목" value={version.detailedTestItem} />
        )}
        <Meta label="★보고서 번호" value={version.reportNo ?? "-"} />
        <div>
          <dt className="text-slate-500 dark:text-slate-400">★성적서 번호</dt>
          <dd className="break-words text-slate-800 dark:text-slate-200">
            {version.certificateNo && certificateHref ? (
              <a
                href={certificateHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-700 underline hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
              >
                {version.certificateNo}
              </a>
            ) : (
              "-"
            )}
          </dd>
        </div>
        <Meta label="★시험기관" value={version.testingLab ?? "-"} />
        <Meta label="★발행일" value={version.revisionDate ?? "-"} />
        <Meta label="★개정번호" value={version.revisionNo ?? "-"} />
        {version.docKind !== "plan" && version.writtenLanguage && (
          <Meta label="★작성 언어" value={version.writtenLanguage} />
        )}
        <Meta
          label="★적용 규격"
          value={version.appliedStandard ?? "-"}
          full
        />
        <div className="col-span-full">
          <dt className="text-slate-500 dark:text-slate-400">★최신 규격</dt>
          <dd className="break-words text-slate-800 dark:text-slate-200">
            {latestStandard ?? "-"}
            {latestStandard && latestStandard !== version.appliedStandard && (
              <span className="ml-1 text-amber-700 dark:text-amber-300">
                (이 성적서의 적용 규격보다 새 판)
              </span>
            )}
            {version.latestStandardSource && (
              <a
                href={version.latestStandardSource}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-sky-700 underline hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
              >
                근거
              </a>
            )}
          </dd>
        </div>
        <div className="col-span-full">
          <dt className="text-slate-500 dark:text-slate-400">★성적서 링크</dt>
          <dd className="break-words">
            <a
              href={fileHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sky-700 underline hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
            >
              {version.originalName}
            </a>
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ComparisonBlock({
  version,
  displayNo,
}: {
  version: DocRecord["versions"][number];
  displayNo: Map<number, number>;
}) {
  const summary = version.changeSummary;

  return (
    <div className="mt-2">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        v{displayNo.get(version.version)} (개정번호 {version.revisionNo ?? "없음"} / 개정일자{" "}
        {version.revisionDate ?? "없음"})
        {summary && (
          <span className="text-slate-500 dark:text-slate-400">
            {" "}
            ← 비교 대상: v{displayNo.get(summary.comparedWith.version)} (개정번호{" "}
            {summary.comparedWith.revisionNo ?? "없음"} / 개정일자{" "}
            {summary.comparedWith.revisionDate ?? "없음"})
          </span>
        )}
      </p>
      {summary ? (
        <SummaryBlock summary={summary} />
      ) : (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          비교 결과가 아직 없습니다.
        </p>
      )}
    </div>
  );
}

function SummaryBlock({ summary }: { summary: ChangeSummary }) {
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          변경 요약
        </span>
        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {summary.generatedBy === "ai" ? "AI 요약" : "규칙 기반 요약"}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          추가 {summary.addedCount}줄 · 삭제 {summary.removedCount}줄
        </span>
      </div>

      {summary.reasonForIssue && (
        <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 dark:bg-sky-950">
          <p className="text-xs font-medium text-sky-800 dark:text-sky-200">
            발행 및 개정사유 (문서에 명시된 근거)
          </p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-sky-900 dark:text-sky-100">
            {summary.reasonForIssue}
          </p>
        </div>
      )}

      {summary.headline !== summary.reasonForIssue && (
        <p className="mt-2 text-sm text-slate-800 dark:text-slate-100">{summary.headline}</p>
      )}

      {summary.caveat && (
        <p className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          ※ {summary.caveat}
        </p>
      )}

      {summary.warning && (
        <p className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {summary.warning}
        </p>
      )}

      {summary.items.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
            본문 줄 단위 비교 상세 보기 (참고용)
          </summary>
          <ul className="mt-2 space-y-3">
            {summary.items.map((item, index) => (
              <li
                key={`${item.clause}-${index}`}
                className="rounded-lg bg-white p-3 text-sm dark:bg-slate-900"
              >
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  [{item.clause}] {item.summary}
                </p>
                {(item.before || item.after) && (
                  <div className="mt-2 space-y-1 text-xs">
                    {item.before && (
                      <p className="text-red-700 dark:text-red-300">
                        이전: {item.before}
                      </p>
                    )}
                    {item.after && (
                      <p className="text-emerald-700 dark:text-emerald-300">
                        변경: {item.after}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Meta({
  label,
  value,
  full,
  mono,
}: {
  label: string;
  value: string;
  full?: boolean;
  mono?: boolean;
}) {
  return (
    <div className={full ? "col-span-full" : undefined}>
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`whitespace-pre-line break-words text-slate-800 dark:text-slate-200 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
