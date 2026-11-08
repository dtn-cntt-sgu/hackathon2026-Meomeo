import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CONFIG } from "@/contracts";
import type { RepoSnapshotKey, StaticEngineResult } from "@/contracts";
import {
  clearEngineCache,
  deleteInFlightPromise,
  getEngineResultCache,
  getInFlightPromise,
  makeAnalysisCacheKey,
  makeEngineCacheKey,
  setEngineResultCache,
  setInFlightPromise,
} from "../cache";

function makeDummyResult(snapshotId: string): StaticEngineResult {
  return {
    engine_version: CONFIG.ENGINE_VERSION,
    repo_name: "dummy-repo",
    snapshot: {
      source: "GITHUB",
      repo_key: "owner/repo",
      snapshot_id: snapshotId,
      snapshot_id_kind: "COMMIT_SHA",
      subdir: "",
      ref_label: "main",
    },
    fingerprint: {
      archetype: "WEB_BACKEND",
      primary_language: "TYPESCRIPT",
      language_breakdown: [],
      graph_confidence: "HIGH",
      detected_framework: null,
      tech_stack: [],
      is_monorepo: false,
      root_dir_offset: "",
    },
    total_files: 1,
    nodes: [],
    edges: [],
    groups: [],
    symbol_whitelist: [],
    file_index: [],
    readme_excerpt: null,
    manifest_description: null,
    ingestion_report: {
      truncated: false,
      selective_fetch: false,
      code_file_count: 1,
      manifest_count: 0,
      omitted_node_count: 0,
      skipped: {
        garbage: 0,
        binary: 0,
        oversized: 0,
        unsupported_lang: 0,
        quota: 0,
        parse_error: 0,
      },
      warnings: [],
      degraded_mode: null,
      redacted_secret_count: 0,
      engine_ms: 10,
      ingest_ms: 20,
      suspicious_instruction_files: [],
    },
  };
}

describe("cache.ts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearEngineCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("makeEngineCacheKey", () => {
    it("ghép khóa dạng snapshotId|subdir|engineVersion", () => {
      const key = makeEngineCacheKey("commit123", "src/server", "1.7.0");
      expect(key).toBe("commit123|src/server|1.7.0");
    });
  });

  describe("EngineResultCache (LRU TTL)", () => {
    it("lưu và lấy kết quả thành công", () => {
      const res = makeDummyResult("snap-1");
      setEngineResultCache("snap-1", "", CONFIG.ENGINE_VERSION, res);

      const cached = getEngineResultCache("snap-1", "", CONFIG.ENGINE_VERSION);
      expect(cached).toEqual(res);
    });

    it("hết TTL thì trả null và xóa mục hết hạn", () => {
      const res = makeDummyResult("snap-ttl");
      setEngineResultCache("snap-ttl", "", CONFIG.ENGINE_VERSION, res);

      // Tiến thời gian quá CONFIG.INGESTION_CACHE_TTL_MS
      vi.advanceTimersByTime(CONFIG.INGESTION_CACHE_TTL_MS + 10);

      const cached = getEngineResultCache("snap-ttl", "", CONFIG.ENGINE_VERSION);
      expect(cached).toBeNull();
    });

    it("vượt CONFIG.INGESTION_CACHE_MAX_ENTRIES thì bỏ mục cũ nhất", () => {
      const max = CONFIG.INGESTION_CACHE_MAX_ENTRIES;
      for (let i = 0; i < max; i++) {
        setEngineResultCache(`snap-${i}`, "", CONFIG.ENGINE_VERSION, makeDummyResult(`snap-${i}`));
      }

      // Đã đủ max mục (từ snap-0 đến snap-(max-1))
      expect(getEngineResultCache("snap-0", "", CONFIG.ENGINE_VERSION)).not.toBeNull();

      // Thêm 1 mục mới vượt trần
      setEngineResultCache(`snap-${max}`, "", CONFIG.ENGINE_VERSION, makeDummyResult(`snap-${max}`));

      // snap-0 đã được get ở trên nên nó được đưa lên mới nhất, vì thế mục cũ nhất kế tiếp (snap-1) sẽ bị bỏ
      expect(getEngineResultCache("snap-0", "", CONFIG.ENGINE_VERSION)).not.toBeNull();
      expect(getEngineResultCache("snap-1", "", CONFIG.ENGINE_VERSION)).toBeNull();
      expect(getEngineResultCache(`snap-${max}`, "", CONFIG.ENGINE_VERSION)).not.toBeNull();
    });

    it("get đưa mục lên mới nhất nên không bị xóa khi thêm mục mới", () => {
      clearEngineCache();
      const max = CONFIG.INGESTION_CACHE_MAX_ENTRIES;

      for (let i = 0; i < max; i++) {
        setEngineResultCache(`item-${i}`, "", CONFIG.ENGINE_VERSION, makeDummyResult(`item-${i}`));
      }

      // Truy cập item-0 để đưa lên mới nhất
      const item0 = getEngineResultCache("item-0", "", CONFIG.ENGINE_VERSION);
      expect(item0).not.toBeNull();

      // Thêm item mới
      setEngineResultCache("item-new", "", CONFIG.ENGINE_VERSION, makeDummyResult("item-new"));

      // item-0 vẫn còn, item-1 (cũ nhất) bị loại bỏ
      expect(getEngineResultCache("item-0", "", CONFIG.ENGINE_VERSION)).not.toBeNull();
      expect(getEngineResultCache("item-1", "", CONFIG.ENGINE_VERSION)).toBeNull();
      expect(getEngineResultCache("item-new", "", CONFIG.ENGINE_VERSION)).not.toBeNull();
    });

    it("get trúng không gia hạn TTL", () => {
      const res = makeDummyResult("snap-no-renew");
      setEngineResultCache("snap-no-renew", "", CONFIG.ENGINE_VERSION, res);

      // Đi 60% TTL
      vi.advanceTimersByTime(CONFIG.INGESTION_CACHE_TTL_MS * 0.6);
      expect(getEngineResultCache("snap-no-renew", "", CONFIG.ENGINE_VERSION)).not.toBeNull();

      // Đi thêm 50% TTL nữa (tổng 110% TTL)
      vi.advanceTimersByTime(CONFIG.INGESTION_CACHE_TTL_MS * 0.5);
      expect(getEngineResultCache("snap-no-renew", "", CONFIG.ENGINE_VERSION)).toBeNull();
    });
  });

  describe("In-flight promises", () => {
    it("set, get và delete promise đang chạy", async () => {
      const key = "test-inflight-key";
      expect(getInFlightPromise(key)).toBeUndefined();

      const p = Promise.resolve("done");
      setInFlightPromise(key, p);
      expect(getInFlightPromise(key)).toBe(p);

      deleteInFlightPromise(key);
      expect(getInFlightPromise(key)).toBeUndefined();
    });
  });

  describe("makeAnalysisCacheKey", () => {
    it("đúng định dạng na|source|snapshot_id|subdir|engine_version|node_id|prompt_version|llm_model", () => {
      const snapshot: RepoSnapshotKey = {
        source: "GITHUB",
        repo_key: "facebook/react",
        snapshot_id: "abc1234567890abcdef1234567890abcdef1234",
        snapshot_id_kind: "COMMIT_SHA",
        subdir: "packages/react",
        ref_label: "main",
      };

      const key = makeAnalysisCacheKey(snapshot, CONFIG.ENGINE_VERSION, "node-1");
      expect(key).toBe(
        `na|GITHUB|abc1234567890abcdef1234567890abcdef1234|packages/react|${CONFIG.ENGINE_VERSION}|node-1|${CONFIG.PROMPT_VERSION}|${CONFIG.LLM_MODEL}`,
      );
    });
  });
});
