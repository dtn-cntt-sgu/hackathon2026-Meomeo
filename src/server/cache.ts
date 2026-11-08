import { CONFIG } from "@/contracts";
import type { RepoSnapshotKey, StaticEngineResult } from "@/contracts";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class LruTtlCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    // Trúng thì đưa mục lên mới nhất nhưng KHÔNG gia hạn TTL
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      // Vượt maxEntries thì bỏ mục cũ nhất
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.map.clear();
  }
}

const engineResultCache = new LruTtlCache<StaticEngineResult>(
  CONFIG.INGESTION_CACHE_MAX_ENTRIES,
  CONFIG.INGESTION_CACHE_TTL_MS,
);

export function makeEngineCacheKey(
  snapshotId: string,
  subdir: string,
  engineVersion: string,
): string {
  return `${snapshotId}|${subdir}|${engineVersion}`;
}

export function getEngineResultCache(
  snapshotId: string,
  subdir: string,
  engineVersion: string,
): StaticEngineResult | null {
  return engineResultCache.get(makeEngineCacheKey(snapshotId, subdir, engineVersion));
}

export function setEngineResultCache(
  snapshotId: string,
  subdir: string,
  engineVersion: string,
  result: StaticEngineResult,
): void {
  engineResultCache.set(makeEngineCacheKey(snapshotId, subdir, engineVersion), result);
}

export function clearEngineCache(): void {
  engineResultCache.clear();
}

const inFlightMap = new Map<string, Promise<unknown>>();

export function getInFlightPromise<T>(key: string): Promise<T> | undefined {
  return inFlightMap.get(key) as Promise<T> | undefined;
}

export function setInFlightPromise<T>(key: string, promise: Promise<T>): void {
  inFlightMap.set(key, promise);
}

export function deleteInFlightPromise(key: string): void {
  inFlightMap.delete(key);
}

export function makeAnalysisCacheKey(
  snapshot: RepoSnapshotKey,
  engineVersion: string,
  nodeId: string,
): string {
  return `na|${snapshot.source}|${snapshot.snapshot_id}|${snapshot.subdir}|${engineVersion}|${nodeId}|${CONFIG.PROMPT_VERSION}|${CONFIG.LLM_MODEL}`;
}

/** Tổng quan repo (AI): 1 bản / snapshot + engine + prompt + model, dùng chung mọi phiên. */
export function makeOverviewCacheKey(snapshot: RepoSnapshotKey, engineVersion: string): string {
  return `ov|${snapshot.source}|${snapshot.snapshot_id}|${snapshot.subdir}|${engineVersion}|${CONFIG.PROMPT_VERSION}|${CONFIG.LLM_MODEL_BY_KIND.OVERVIEW}`;
}
