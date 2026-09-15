import type { DocRecord, DocVersion } from "./types";

/**
 * 버전을 항상 개정 순서대로 돌려준다.
 * 폴더를 훑는 순서는 보장되지 않으므로(예: Original이 담긴 폴더를 나중에 훑을 수 있다),
 * 배열에 쌓인 순서가 아니라 개정번호(revisionRank) 기준으로 정렬해야 한다.
 */
export function orderVersions(versions: DocVersion[]): DocVersion[] {
  return [...versions].sort((a, b) => {
    if (a.revisionRank !== null && b.revisionRank !== null) {
      return a.revisionRank - b.revisionRank;
    }
    if (a.revisionRank !== null) return -1;
    if (b.revisionRank !== null) return 1;
    return a.version - b.version;
  });
}

/** 개정 순서상 가장 최신 버전 */
export function latestVersion(record: DocRecord): DocVersion | undefined {
  return orderVersions(record.versions).at(-1);
}
