import { describe, expect, it } from "vitest";
import type { IngestionReport } from "@/contracts";
import { pageRank, rankFiles } from "./pagerank";
import { tarjanScc } from "./tarjan";

function createMockReport(): IngestionReport {
  return {
    truncated: false,
    selective_fetch: false,
    code_file_count: 0,
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
    engine_ms: 0,
    ingest_ms: 0,
    suspicious_instruction_files: [],
  };
}

describe("Tarjan & PageRank (ENG-60, ENG-62)", () => {
  it("Đồ thị rỗng: tarjanScc và pageRank trả về rỗng", () => {
    const sccs = tarjanScc([], new Map());
    expect(sccs).toEqual([]);

    const pr = pageRank(new Map());
    expect(pr.size).toBe(0);

    const scores = rankFiles(new Map(), new Set());
    expect(scores.size).toBe(0);
  });

  it("N = 1: pageRank trả về 1", () => {
    const dag = new Map<string, string[]>([["A", []]]);
    const pr = pageRank(dag);
    expect(pr.size).toBe(1);
    expect(pr.get("A")).toBe(1);
  });

  it("T-ENG-05: PageRank chuỗi C → S → R và rankFiles với C là Ingress", () => {
    // C -> S -> R
    const dag = new Map<string, string[]>([
      ["C", ["S"]],
      ["S", ["R"]],
      ["R", []],
    ]);

    const pr = pageRank(dag);
    const prC = pr.get("C")!;
    const prS = pr.get("S")!;
    const prR = pr.get("R")!;

    // Kỳ vọng: ≈ 0.1844 / 0.3412 / 0.4744 (±1e-3)
    expect(prC).toBeCloseTo(0.1844, 3);
    expect(prS).toBeCloseTo(0.3412, 3);
    expect(prR).toBeCloseTo(0.4744, 3);

    // Kiểm tra rankFiles
    const fg = new Map<
      string,
      Map<string, { weight: number; confidence: "RESOLVED" | "INFERRED" }>
    >([
      [
        "C",
        new Map([["S", { weight: 1, confidence: "RESOLVED" as const }]]),
      ],
      [
        "S",
        new Map([["R", { weight: 1, confidence: "RESOLVED" as const }]]),
      ],
      ["R", new Map()],
    ]);

    const ingressFiles = new Set(["C"]);
    const report = createMockReport();
    const scores = rankFiles(fg, ingressFiles, report);

    // C Ingress ⇒ 0.1844 + 0.5 = 0.6844 (±1e-3)
    expect(scores.get("C")!).toBeCloseTo(0.6844, 3);
    expect(scores.get("S")!).toBeCloseTo(0.3412, 3);
    expect(scores.get("R")!).toBeCloseTo(0.4744, 3);
  });

  it("T-ENG-06: Tarjan 1 → 2, 2 ⇄ 3 và cảnh báo SCC khổng lồ 5/8 file", () => {
    // 1 -> 2, 2 <-> 3
    const adj = new Map<string, string[]>([
      ["1", ["2"]],
      ["2", ["3"]],
      ["3", ["2"]],
    ]);

    const sccs = tarjanScc(["1", "2", "3"], adj);
    expect(sccs.length).toBe(2);

    const sccStrings = sccs.map((s) => s.join(",")).sort();
    expect(sccStrings).toEqual(["1", "2,3"]);

    // SCC 5/8 file không tách được
    // 8 files: f1..f5 tạo thành chu trình mạnh với nhiều cạnh song song hoặc liên kết chéo
    // f6, f7, f8 đứng riêng
    const fg = new Map<
      string,
      Map<string, { weight: number; confidence: "RESOLVED" | "INFERRED" }>
    >();

    for (let i = 1; i <= 8; i++) {
      fg.set(`f${i}`, new Map());
    }

    // Đồ thị đầy đủ giữa f1..f5 với trọng số lớn
    const giantNodes = ["f1", "f2", "f3", "f4", "f5"];
    for (const u of giantNodes) {
      for (const v of giantNodes) {
        if (u !== v) {
          fg.get(u)!.set(v, { weight: 10, confidence: "RESOLVED" });
        }
      }
    }

    const report = createMockReport();
    const scores = rankFiles(fg, new Set(), report);

    // Mọi file đều có điểm
    expect(scores.size).toBe(8);
    for (let i = 1; i <= 8; i++) {
      expect(scores.has(`f${i}`)).toBe(true);
    }

    // Tỉ lệ 5/8 = 0.625 > CONFIG.GIANT_SCC_RATIO (0.40) ⇒ có warning
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings[0]).toContain(
      "Phát hiện cụm phụ thuộc vòng lớn (5 file)"
    );
  });
});
