import { readFile, writeFile } from "node:fs/promises";
import {
  GOOGLE_API_KEY,
  GOOGLE_CSE_ID,
  STANDARD_CACHE_FILE,
  STANDARD_CACHE_TTL_DAYS,
  STANDARD_LOOKUP_ENABLED,
} from "./config";

/**
 * 적용 규격에 더 새로운 판이 나왔는지 구글 검색으로 확인한다.
 *
 * 예: 성적서가 "IEC 60601-1-2:2014"(4.0판)로 시험했는데 지금은 "IEC 60601-1-2:2014/AMD1:2020"
 * (4.1판)이 최신이면, 담당자가 재시험 필요 여부를 판단할 수 있도록 최신 규격으로 보여 준다.
 *
 * 규격 개정은 자주 일어나지 않으므로 한 번 확인한 결과는 파일에 적어 두고 재사용한다.
 * 확인한 근거(검색 결과 주소)를 함께 남겨, 담당자가 직접 확인할 수 있게 한다.
 */

export type StandardLookup = {
  /** 찾아낸 최신 규격 표기. 더 새로운 판이 없으면 적용 규격과 같다 */
  latest: string;
  /** 판단 근거가 된 검색 결과 주소 (직접 적어 넣은 경우 null) */
  source: string | null;
  checkedAt: string;
};

type CacheFile = Record<string, StandardLookup>;

/** 규격 표기에서 "계열"과 "판(년도)"을 뽑는다 (예: "ASTM F1980-21" → ASTM F1980 / 2021) */
export function parseStandard(text: string): { family: string; year: number } | null {
  // ISO·IEC·EN 계열: "IEC 60601-1-2:2014"
  const colon = text.match(/\b((?:IEC|ISO|EN|KS)\s+[0-9][0-9.\-]*)\s*:\s*((?:19|20)[0-9]{2})/i);
  if (colon) return { family: normalizeFamily(colon[1]), year: Number(colon[2]) };

  // ASTM 계열: "ASTM F1980-21" (뒤 두 자리가 발행 연도)
  const astm = text.match(/\b(ASTM\s+[A-Z]?[0-9]{2,5})\s*-\s*([0-9]{2,4})\b/i);
  if (astm) return { family: normalizeFamily(astm[1]), year: toFullYear(astm[2]) };

  return null;
}

function normalizeFamily(family: string): string {
  return family.replace(/\s+/g, " ").trim().toUpperCase();
}

function toFullYear(value: string): number {
  const number = Number(value);
  if (value.length === 4) return number;
  // 두 자리 연도는 올해보다 크면 1900년대로 본다 (예: 98 → 1998, 21 → 2021)
  const currentShort = new Date().getFullYear() % 100;
  return number > currentShort + 1 ? 1900 + number : 2000 + number;
}

/** 적용 규격 문구 전체에서 가장 나중 연도를 찾는다 (개정판 표기까지 반영) */
function latestYearIn(text: string): number {
  const years = [...text.matchAll(/\b(?:19|20)[0-9]{2}\b/g)].map((match) => Number(match[0]));
  const astmYears = [...text.matchAll(/\bASTM\s+[A-Z]?[0-9]{2,5}\s*-\s*([0-9]{2})\b/gi)].map(
    (match) => toFullYear(match[1]),
  );
  return Math.max(0, ...years, ...astmYears);
}

/**
 * 검색 결과 글에서 같은 계열의 규격 표기를 모두 찾아, 가장 나중 판을 고른다.
 * 예: "IEC 60601-1-2:2014/AMD1:2020" → 2020년 판
 */
function findNewestMention(family: string, text: string): { designation: string; year: number } | null {
  const escaped = family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  const pattern = new RegExp(
    `${escaped}\\s*(?::|-)\\s*([0-9]{2,4})(\\s*/\\s*AMD\\s*[0-9]\\s*:\\s*((?:19|20)[0-9]{2}))?`,
    "gi",
  );

  let best: { designation: string; year: number } | null = null;
  for (const match of text.matchAll(pattern)) {
    const baseYear = toFullYear(match[1]);
    const amendmentYear = match[3] ? Number(match[3]) : 0;
    const year = Math.max(baseYear, amendmentYear);
    if (!Number.isFinite(year) || year < 1980 || year > new Date().getFullYear() + 1) continue;
    if (!best || year > best.year) {
      best = { designation: match[0].replace(/\s+/g, " ").trim(), year };
    }
  }
  return best;
}

async function readCache(): Promise<CacheFile> {
  try {
    return JSON.parse(await readFile(STANDARD_CACHE_FILE, "utf8")) as CacheFile;
  } catch {
    return {};
  }
}

async function writeCache(cache: CacheFile): Promise<void> {
  await writeFile(STANDARD_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

function isFresh(entry: StandardLookup): boolean {
  const age = Date.now() - new Date(entry.checkedAt).getTime();
  return age < STANDARD_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

/** 구글 검색으로 같은 계열 규격이 언급된 글을 모아 온다 */
async function googleSearch(query: string): Promise<{ text: string; link: string }[]> {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) return [];

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", GOOGLE_API_KEY);
  url.searchParams.set("cx", GOOGLE_CSE_ID);
  url.searchParams.set("q", query);
  url.searchParams.set("num", "10");

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`구글 검색 실패 (${response.status})`);

  const body = (await response.json()) as {
    items?: { title?: string; snippet?: string; link?: string }[];
  };
  return (body.items ?? []).map((item) => ({
    text: `${item.title ?? ""} ${item.snippet ?? ""}`,
    link: item.link ?? "",
  }));
}

/**
 * 적용 규격의 최신판을 찾는다.
 * 더 새로운 판을 못 찾으면 적용 규격을 그대로 최신 규격으로 돌려준다.
 */
export async function findLatestStandard(appliedStandard: string): Promise<StandardLookup | null> {
  const parsed = parseStandard(appliedStandard);
  if (!parsed) return null;

  const cacheKey = appliedStandard.trim();
  const cache = await readCache();
  const cached = cache[cacheKey];
  if (cached && isFresh(cached)) return cached;

  if (!STANDARD_LOOKUP_ENABLED || !GOOGLE_API_KEY || !GOOGLE_CSE_ID) return cached ?? null;

  let result: StandardLookup;
  try {
    const appliedYear = latestYearIn(appliedStandard);
    const hits = await googleSearch(`"${parsed.family}" standard latest edition`);

    let newest: { designation: string; year: number; link: string } | null = null;
    for (const hit of hits) {
      const found = findNewestMention(parsed.family, hit.text);
      if (found && (!newest || found.year > newest.year)) {
        newest = { ...found, link: hit.link };
      }
    }

    result =
      newest && newest.year > appliedYear
        ? { latest: newest.designation, source: newest.link, checkedAt: new Date().toISOString() }
        : { latest: appliedStandard, source: null, checkedAt: new Date().toISOString() };
  } catch {
    // 검색이 막히거나 실패해도 스캔 자체는 계속되어야 한다
    return cached ?? null;
  }

  cache[cacheKey] = result;
  await writeCache(cache);
  return result;
}
