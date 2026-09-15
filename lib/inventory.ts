import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DATA_ROOT,
  INVENTORY_FILE,
  MAX_INVENTORY_CHANGES,
  MAX_INVENTORY_DEPTH,
} from "./config";
import type { InventoryChange, InventoryResult } from "./types";

// 파일 목록과 크기·수정일만 읽으므로 온라인 전용 파일이 내려받아지지 않는다.

type FileInfo = { size: number; mtimeMs: number };
type Snapshot = { takenAt: string; files: Record<string, FileInfo> };
type SnapshotStore = Record<string, Snapshot>;

/** 폴더의 파일 현황을 훑고 지난번과 비교한다 */
export async function scanInventory(rootPath: string): Promise<InventoryResult> {
  const files = await collectFileInfo(rootPath);
  const store = await readStore();
  const previous = store[rootPath];
  const takenAt = new Date().toISOString();

  const changes = previous ? diffSnapshots(previous.files, files) : [];

  store[rootPath] = { takenAt, files };
  await writeStore(store);

  return {
    rootPath,
    totalFiles: Object.keys(files).length,
    byExtension: countByExtension(files),
    changes: changes.slice(0, MAX_INVENTORY_CHANGES),
    changeCount: changes.length,
    firstRun: !previous,
    previousTakenAt: previous?.takenAt ?? null,
    takenAt,
  };
}

function diffSnapshots(
  before: Record<string, FileInfo>,
  after: Record<string, FileInfo>,
): InventoryChange[] {
  const added: string[] = [];
  const removed: string[] = [];
  const changes: InventoryChange[] = [];

  for (const [filePath, info] of Object.entries(after)) {
    const old = before[filePath];
    if (!old) {
      added.push(filePath);
    } else if (old.size !== info.size || old.mtimeMs !== info.mtimeMs) {
      changes.push({ kind: "modified", path: filePath, ext: extOf(filePath) });
    }
  }

  for (const filePath of Object.keys(before)) {
    if (!after[filePath]) removed.push(filePath);
  }

  // 크기·확장자가 같고 수정시각이 거의 같은 삭제·추가 쌍은 이름이 바뀐 것으로 본다
  const unmatchedRemoved = [...removed];
  for (const newPath of added) {
    const info = after[newPath];
    const matchIndex = unmatchedRemoved.findIndex((oldPath) => {
      const old = before[oldPath];
      return (
        old.size === info.size &&
        Math.abs(old.mtimeMs - info.mtimeMs) < 2000 &&
        extOf(oldPath) === extOf(newPath)
      );
    });

    if (matchIndex >= 0) {
      const [oldPath] = unmatchedRemoved.splice(matchIndex, 1);
      changes.push({
        kind: "renamed",
        path: newPath,
        from: oldPath,
        ext: extOf(newPath),
      });
    } else {
      changes.push({ kind: "added", path: newPath, ext: extOf(newPath) });
    }
  }

  for (const oldPath of unmatchedRemoved) {
    changes.push({ kind: "removed", path: oldPath, ext: extOf(oldPath) });
  }

  return changes.sort((a, b) => rank(a.kind) - rank(b.kind));
}

async function collectFileInfo(
  rootPath: string,
): Promise<Record<string, FileInfo>> {
  const files: Record<string, FileInfo> = {};

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_INVENTORY_DEPTH) return;

    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        await walk(full, depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;
      // OneDrive가 만드는 관리용 파일은 제외한다
      if (entry.name === "desktop.ini" || entry.name.startsWith(".")) continue;

      const info = await stat(full).catch(() => null);
      if (!info) continue;
      files[path.relative(rootPath, full)] = {
        size: info.size,
        mtimeMs: info.mtimeMs,
      };
    }
  }

  await walk(rootPath, 0);
  return files;
}

function countByExtension(
  files: Record<string, FileInfo>,
): { ext: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const filePath of Object.keys(files)) {
    const ext = extOf(filePath);
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count);
}

function extOf(filePath: string): string {
  return path.extname(filePath).toLowerCase() || "(확장자 없음)";
}

function rank(kind: InventoryChange["kind"]): number {
  if (kind === "added") return 0;
  if (kind === "modified") return 1;
  if (kind === "renamed") return 2;
  return 3;
}

async function readStore(): Promise<SnapshotStore> {
  try {
    return JSON.parse(await readFile(INVENTORY_FILE, "utf8")) as SnapshotStore;
  } catch {
    return {};
  }
}

async function writeStore(store: SnapshotStore): Promise<void> {
  await mkdir(DATA_ROOT, { recursive: true });
  await writeFile(INVENTORY_FILE, JSON.stringify(store), "utf8");
}
