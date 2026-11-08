import { describe, expect, it } from "vitest";
import { CONFIG } from "@/contracts";
import type { ArchitecturalLayer, HybridArchitecturalNode, StaticEngineResult } from "@/contracts";
import fixtureJson from "../__fixtures__/shop-api.json";

const fixture = fixtureJson as StaticEngineResult;

const BUSINESS_LAYERS: ArchitecturalLayer[] = ["ENTRY_POINT", "MIDDLEWARE", "BUSINESS_LOGIC", "DATA_ACCESS"];
const TITLE_SOURCES = ["ROUTE", "ENTRY_SYMBOL", "DOMAIN_TERMS", "DIRECTORY", "FILE_BASENAME", "VIRTUAL"];
const ENTITY_OPS = ["CREATE", "READ", "UPDATE", "DELETE"];
const FORBIDDEN_TERMS = [
  "kafka", "redis", "rabbitmq", "microservices", "docker", "kubernetes",
  "graphql", "grpc", "elasticsearch", "mongodb", "aws", "serverless",
];

const byId = new Map(fixture.nodes.map((n) => [n.id, n]));
const node = (id: string): HybridArchitecturalNode => {
  const n = byId.get(id);
  if (!n) throw new Error(`thiếu node ${id}`);
  return n;
};
const lineCount = (s: string) => s.split("\n").length;

describe("FIX-01 shop-api: hình dạng StaticEngineResult", () => {
  it("có đủ các trường cấp cao đúng kiểu", () => {
    expect(fixture.engine_version).toBe(CONFIG.ENGINE_VERSION);
    expect(fixture.repo_name).toBe("shop-api");
    expect(typeof fixture.total_files).toBe("number");
    expect(Array.isArray(fixture.nodes)).toBe(true);
    expect(Array.isArray(fixture.edges)).toBe(true);
    expect(Array.isArray(fixture.groups)).toBe(true);
    expect(Array.isArray(fixture.symbol_whitelist)).toBe(true);
    expect(Array.isArray(fixture.file_index)).toBe(true);
    expect(fixture.readme_excerpt === null || typeof fixture.readme_excerpt === "string").toBe(true);
    expect(fixture.manifest_description === null || typeof fixture.manifest_description === "string").toBe(true);
  });

  it("snapshot đúng RepoSnapshotKey", () => {
    const s = fixture.snapshot;
    expect(["GITHUB", "ZIP"]).toContain(s.source);
    expect(s.repo_key).toBe("demo/shop-api");
    expect(s.snapshot_id_kind).toBe("COMMIT_SHA");
    expect(s.snapshot_id).toMatch(/^[0-9a-f]{40}$/);
    expect(s.subdir).toBe("");
    expect(s.ref_label === null || typeof s.ref_label === "string").toBe(true);
  });

  it("fingerprint theo spec 50 Mục 1", () => {
    const f = fixture.fingerprint;
    expect(f.archetype).toBe("WEB_BACKEND");
    expect(f.primary_language).toBe("TYPESCRIPT");
    expect(f.language_breakdown[0]).toMatchObject({ language: "TYPESCRIPT", tier: "RESOLVED" });
    expect(["HIGH", "MIXED", "LOW"]).toContain(f.graph_confidence);
    expect(f.tech_stack).toEqual(["express", "typeorm", "pg", "zod", "jsonwebtoken"]);
    expect(f.is_monorepo).toBe(false);
    expect(f.root_dir_offset).toBe("");
    for (const term of FORBIDDEN_TERMS) expect(f.tech_stack).not.toContain(term);
  });

  it("ingestion_report đủ trường, không lộ danh sách file nghi ngờ", () => {
    const r = fixture.ingestion_report;
    expect(r.truncated).toBe(false);
    expect(r.degraded_mode).toBeNull();
    expect(r.omitted_node_count).toBe(0);
    expect(Object.keys(r.skipped).sort()).toEqual(
      ["binary", "garbage", "oversized", "parse_error", "quota", "unsupported_lang"],
    );
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(r.suspicious_instruction_files).toEqual([]);
    expect(r.redacted_secret_count).toBeGreaterThanOrEqual(1);
    expect(r.code_file_count).toBe(fixture.file_index.length);
    expect(r.engine_ms).toBeGreaterThan(0);
    expect(r.ingest_ms).toBeGreaterThan(0);
  });

  it("symbol_whitelist và file_index đã sort, không trùng", () => {
    for (const list of [fixture.symbol_whitelist, fixture.file_index]) {
      expect(list).toEqual([...list].sort());
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe("FIX-02 shop-api: 7 node N1–N7", () => {
  it("có đúng 7 node, id duy nhất, đúng thứ tự N1 … N7", () => {
    expect(fixture.nodes.map((n) => n.id)).toEqual([
      "slice-register", "slice-profile", "slice-product-list", "slice-cart",
      "slice-order-checkout", "slice-send-email", "slice-revenue-report",
    ]);
    expect(byId.size).toBe(7);
    expect(fixture.nodes.length).toBeGreaterThanOrEqual(CONFIG.DISPLAY_MIN_NODES);
    expect(fixture.nodes.length).toBeLessThanOrEqual(CONFIG.DISPLAY_MAX_NODES);
  });

  it("không có node thuật toán (B13)", () => {
    for (const n of fixture.nodes) {
      expect(n.node_type).toBe("ARCHITECTURAL_DATA_FLOW");
      expect(n.is_vip_algorithm).toBe(false);
      for (const s of n.trace_steps) expect(BUSINESS_LAYERS).toContain(s.layer);
    }
  });

  it("trường của từng node đúng kiểu", () => {
    for (const n of fixture.nodes) {
      expect(TITLE_SOURCES).toContain(n.title_source);
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.title_evidence.length).toBeGreaterThan(0);
      expect(typeof n.entry_symbol).toBe("string");
      expect(Number.isFinite(n.position.x) && Number.isFinite(n.position.y)).toBe(true);
      expect(n.files[0]).toBe(n.trace_steps[0].file_path);
      expect(new Set(n.files)).toEqual(new Set(n.trace_steps.map((s) => s.file_path)));
      expect(n.languages).toEqual(["TYPESCRIPT"]);
      expect(n.support_tier).toBe("RESOLVED");
      expect(n.cognitive_complexity).toBeGreaterThan(0);
      expect(typeof n.rank_score).toBe("number");
      expect(typeof n.dto_snippet).toBe("string");
      expect(lineCount(n.dto_snippet)).toBeLessThanOrEqual(CONFIG.STEP_MAX_LINES);
      expect(n.entities.length).toBeGreaterThan(0);
      for (const e of n.entities) {
        expect(e.name.length).toBeGreaterThan(0);
        for (const op of e.ops) expect(ENTITY_OPS).toContain(op);
      }
    }
  });

  it("Capstone: đúng 1 node (N5) và có cognitive_complexity lớn nhất", () => {
    const caps = fixture.nodes.filter((n) => n.is_capstone);
    expect(caps.map((n) => n.id)).toEqual(["slice-order-checkout"]);
    const max = Math.max(...fixture.nodes.map((n) => n.cognitive_complexity));
    expect(caps[0].cognitive_complexity).toBe(max);
    expect(fixture.nodes.filter((n) => n.cognitive_complexity === max)).toHaveLength(1);
  });

  it("Uncle Bob: D = |A + I − 1| và chẩn đoán BALANCED", () => {
    for (const n of fixture.nodes) {
      const u = n.uncle_bob;
      expect(u).not.toBeNull();
      if (!u) continue;
      expect(u.distance).toBeCloseTo(Math.abs(u.abstractness + u.instability - 1), 4);
      expect(u.distance).toBeLessThan(CONFIG.UNCLE_BOB_BALANCED_MAX_D);
      expect(u.diagnosis).toBe("BALANCED");
      expect(u.is_exempt).toBe(false);
    }
  });
});

describe("FIX-03 shop-api: trace_steps, snippet, snippet_line_map", () => {
  it("mỗi node có trace_steps đánh số 1..n", () => {
    for (const n of fixture.nodes) {
      expect(n.trace_steps.length).toBeGreaterThanOrEqual(3);
      expect(n.trace_steps.map((s) => s.step_number)).toEqual(n.trace_steps.map((_, i) => i + 1));
    }
  });

  it("snippet_line_map cùng độ dài số dòng snippet, khớp line_start … line_end", () => {
    for (const n of fixture.nodes) {
      for (const s of n.trace_steps) {
        const at = `${n.id} bước ${s.step_number}`;
        expect(Array.isArray(s.snippet_line_map), at).toBe(true);
        expect(s.snippet_line_map, at).toHaveLength(lineCount(s.snippet));
        expect(s.snippet_line_map[0], at).toBe(s.line_start);
        expect(s.snippet_line_map[s.snippet_line_map.length - 1], at).toBe(s.line_end);
        // Dòng thật tăng dần; dòng 0 (marker lược) chỉ được xen giữa.
        const real = s.snippet_line_map.filter((v) => v !== 0);
        expect(real, at).toEqual([...real].sort((a, b) => a - b));
        expect(new Set(real).size, at).toBe(real.length);
        for (const v of s.snippet_line_map) expect(Number.isInteger(v) && v >= 0, at).toBe(true);
        expect(s.line_end, at).toBeGreaterThanOrEqual(s.line_start);
      }
    }
  });

  it("giới hạn dòng: mỗi bước ≤ STEP_MAX_LINES, mỗi node ≤ NODE_MAX_LINES", () => {
    for (const n of fixture.nodes) {
      let total = 0;
      for (const s of n.trace_steps) {
        expect(s.snippet.trim().length).toBeGreaterThan(0);
        expect(lineCount(s.snippet)).toBeLessThanOrEqual(CONFIG.STEP_MAX_LINES);
        total += lineCount(s.snippet);
      }
      expect(total, n.id).toBeLessThanOrEqual(CONFIG.NODE_MAX_LINES);
    }
  });

  it("file_path kiểu POSIX, tương đối, nằm trong file_index", () => {
    for (const n of fixture.nodes) {
      for (const s of n.trace_steps) {
        expect(s.file_path).not.toMatch(/^\/|\\|^[A-Za-z]:/);
        expect(fixture.file_index).toContain(s.file_path);
        expect(s.function_name.length).toBeGreaterThan(0);
      }
    }
  });

  it("khớp code Mục 1.2 của spec 50 (N3, N2, N5)", () => {
    const n3 = node("slice-product-list").trace_steps;
    expect(n3.map((s) => [s.layer, s.file_path, s.line_start, s.line_end])).toEqual([
      ["ENTRY_POINT", "src/controllers/product.controller.ts", 8, 11],
      ["BUSINESS_LOGIC", "src/services/product.service.ts", 14, 20],
      ["DATA_ACCESS", "src/repos/category.repo.ts", 5, 7],
    ]);
    expect(n3[1].snippet).toContain("await categoryRepo.findById(p.categoryId)");

    const n2 = node("slice-profile").trace_steps;
    expect(n2.map((s) => [s.layer, s.file_path, s.line_start, s.line_end])).toEqual([
      ["ENTRY_POINT", "src/routes/user.routes.ts", 5, 9],
      ["MIDDLEWARE", "src/middlewares/auth.middleware.ts", 3, 12],
      ["DATA_ACCESS", "src/services/user.service.ts", 10, 12],
    ]);

    const n5 = node("slice-order-checkout").trace_steps;
    expect(n5.map((s) => [s.layer, s.file_path, s.line_start, s.line_end])).toEqual([
      ["ENTRY_POINT", "src/routes/order.routes.ts", 12, 15],
      ["MIDDLEWARE", "src/middlewares/auth.middleware.ts", 3, 12],
      ["DATA_ACCESS", "src/services/order.service.ts", 20, 29],
    ]);
  });

  it("secret đã được che trong snippet", () => {
    const all = fixture.nodes.flatMap((n) => n.trace_steps.map((s) => s.snippet)).join("\n");
    expect(all).toContain("<REDACTED_SECRET>");
    expect(all).not.toMatch(/JWT_SECRET\s*=\s*"(?!<REDACTED_SECRET>)/);
  });
});

describe("FIX-04 shop-api: cạnh, prerequisites, nhóm", () => {
  it("6 cạnh theo bản đồ Mục 1.1, id dạng source->target", () => {
    expect(fixture.edges.map((e) => e.id)).toEqual([
      "slice-register->slice-profile",
      "slice-profile->slice-cart",
      "slice-cart->slice-order-checkout",
      "slice-product-list->slice-order-checkout",
      "slice-order-checkout->slice-send-email",
      "slice-order-checkout->slice-revenue-report",
    ]);
    for (const e of fixture.edges) {
      expect(e.id).toBe(`${e.source}->${e.target}`);
      expect(byId.has(e.source)).toBe(true);
      expect(byId.has(e.target)).toBe(true);
      expect(["RESOLVED", "INFERRED"]).toContain(e.confidence);
      expect(Array.isArray(e.via_entities)).toBe(true);
    }
  });

  it("prerequisites của mỗi node đúng bằng các cạnh đi vào", () => {
    for (const n of fixture.nodes) {
      const incoming = fixture.edges.filter((e) => e.target === n.id).map((e) => e.source);
      expect([...n.prerequisites].sort(), n.id).toEqual([...incoming].sort());
    }
    expect(node("slice-order-checkout").prerequisites.sort()).toEqual(["slice-cart", "slice-product-list"]);
  });

  it("đồ thị không có vòng", () => {
    const state = new Map<string, 1 | 2>();
    const visit = (id: string): void => {
      if (state.get(id) === 2) return;
      expect(state.get(id), `vòng tại ${id}`).not.toBe(1);
      state.set(id, 1);
      for (const e of fixture.edges.filter((x) => x.source === id)) visit(e.target);
      state.set(id, 2);
    };
    for (const n of fixture.nodes) visit(n.id);
  });

  it("không khóa cứng người dùng: ≥ 2 node không có prerequisites (AVAILABLE ngay)", () => {
    const roots = fixture.nodes.filter((n) => n.prerequisites.length === 0).map((n) => n.id);
    expect(roots.length).toBeGreaterThanOrEqual(2);
    expect(roots).toEqual(["slice-register", "slice-product-list"]);
  });

  it("groups: mỗi node thuộc đúng 1 nhóm và group_id khớp", () => {
    expect(fixture.groups.map((g) => g.key)).toEqual(["Tài khoản", "Mua hàng", "Sau khi mua"]);
    const seen: string[] = [];
    for (const g of fixture.groups) {
      expect(["ENTITY", "ROUTE_PREFIX", "STANDALONE"]).toContain(g.key_kind);
      expect(g.node_ids.length).toBeGreaterThan(0);
      for (const id of g.node_ids) expect(node(id).group_id).toBe(g.group_id);
      seen.push(...g.node_ids);
    }
    expect([...seen].sort()).toEqual(fixture.nodes.map((n) => n.id).sort());
    expect(new Set(fixture.groups.map((g) => g.group_id)).size).toBe(fixture.groups.length);
  });

  it("nhóm khớp GROUPS của prototype", () => {
    const g = (key: string) => fixture.groups.find((x) => x.key === key)?.node_ids;
    expect(g("Tài khoản")).toEqual(["slice-register", "slice-profile"]);
    expect(g("Mua hàng")).toEqual(["slice-product-list", "slice-cart", "slice-order-checkout"]);
    expect(g("Sau khi mua")).toEqual(["slice-send-email", "slice-revenue-report"]);
  });
});
