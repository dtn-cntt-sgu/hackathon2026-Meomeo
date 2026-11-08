import { strToU8, zipSync, type Zippable } from "fflate";
import { describe, expect, it } from "vitest";
import { CONFIG } from "@/contracts";
import type { IngestionReport } from "@/contracts";
import { computeArchiveHash, computeSnapshot, findEocd, readEocdComment } from "../snapshot";
import type { RawArchive, ZipEntryMeta } from "../types";
import { decodeAndFilter, inflateSelected, listEntries, readCentralDirectory } from "../unzip";

const SHA = "a".repeat(40);

function report(): IngestionReport {
  return {
    truncated: false,
    selective_fetch: false,
    code_file_count: 0,
    manifest_count: 0,
    omitted_node_count: 0,
    skipped: { garbage: 0, binary: 0, oversized: 0, unsupported_lang: 0, quota: 0, parse_error: 0 },
    warnings: [],
    degraded_mode: null,
    redacted_secret_count: 0,
    engine_ms: 0,
    ingest_ms: 0,
    suspicious_instruction_files: [],
  };
}

function zipOf(files: Record<string, string | Uint8Array>): Uint8Array {
  const data: Zippable = {};
  for (const [path, content] of Object.entries(files)) {
    data[path] = typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(data);
}

function withComment(zip: Uint8Array, comment: string): Uint8Array {
  const text = strToU8(comment);
  const out = new Uint8Array(zip.length + text.length);
  out.set(zip);
  out.set(text, zip.length);
  new DataView(out.buffer).setUint16(findEocd(zip) + 20, text.length, true);
  return out;
}

function archive(bytes: Uint8Array, source_url = ""): RawArchive {
  return { bytes, stream_cut: false, source_url };
}

/** Chuỗi hex giả ngẫu nhiên, tỉ lệ nén khoảng 2 nên không bị chặn vì tỉ lệ. */
function noise(length: number): string {
  let seed = 12345;
  let out = "";
  while (out.length < length) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out += seed.toString(16);
    if (out.length % 80 < 8) {
      out += "\n";
    }
  }
  return out.slice(0, length);
}

function plan(entries: ZipEntryMeta[]) {
  return { manifests: [], readme: null, ordered_candidates: entries };
}

describe("snapshot", () => {
  const ctx = { repo_key: "a/b", ref: "main", ref_label: "main", explicit_subdir: "" };

  it("T-ING-33 comment EOCD là SHA thì dùng COMMIT_SHA", () => {
    const bytes = withComment(zipOf({ "a.ts": "x" }), SHA);
    expect(readEocdComment(bytes)).toBe(SHA);
    expect(computeSnapshot(archive(bytes, "https://codeload/x"), ctx)).toMatchObject({
      source: "GITHUB",
      snapshot_id: SHA,
      snapshot_id_kind: "COMMIT_SHA",
      ref_label: "main",
    });
  });

  it("T-ING-33 comment rỗng thì băm toàn bộ buffer", () => {
    const bytes = zipOf({ "a.ts": "x" });
    expect(computeSnapshot(archive(bytes, "https://codeload/x"), ctx)).toMatchObject({
      snapshot_id: computeArchiveHash(bytes),
      snapshot_id_kind: "ARCHIVE_HASH",
    });
  });

  it("T-ING-33 ref là SHA thì thắng comment", () => {
    const bytes = withComment(zipOf({ "a.ts": "x" }), "b".repeat(40));
    const key = computeSnapshot(archive(bytes, "https://codeload/x"), { ...ctx, ref: SHA });
    expect(key.snapshot_id).toBe(SHA);
  });

  it("ING-52 upload luôn dùng ARCHIVE_HASH dù zip mang comment SHA", () => {
    const bytes = withComment(zipOf({ "a.ts": "x" }), SHA);
    expect(computeSnapshot(archive(bytes), { ...ctx, ref: null, ref_label: null })).toMatchObject({
      source: "ZIP",
      snapshot_id: computeArchiveHash(bytes),
      snapshot_id_kind: "ARCHIVE_HASH",
      ref_label: null,
    });
  });

  it("readEocdComment trả null khi không phải zip", () => {
    expect(readEocdComment(new Uint8Array(64))).toBeNull();
  });
});

describe("listEntries", () => {
  const paths = (bytes: Uint8Array) => listEntries(archive(bytes)).map((e) => e.path);

  it("T-ING-18 upload giữ nguyên, GitHub cắt thư mục gốc chung", () => {
    expect(paths(zipOf({ "src/a.ts": "x", "README.md": "y" }))).toEqual(["README.md", "src/a.ts"]);
    expect(paths(zipOf({ "b-main/src/a.ts": "x", "b-main/README.md": "y" }))).toEqual([
      "README.md",
      "src/a.ts",
    ]);
  });

  it("ING-60 bỏ __MACOSX và ._ trước khi tìm thư mục gốc chung", () => {
    const r = report();
    const zip = zipOf({
      "repo/src/a.ts": "x",
      "__MACOSX/repo/src/._a.ts": "y",
      "repo/src/._b.ts": "z",
    });
    expect(listEntries(archive(zip), undefined, r).map((e) => e.path)).toEqual(["src/a.ts"]);
    expect(r.skipped.garbage).toBe(2);
  });

  it("T-ING-19 loại path thoát gốc, kể cả khi mọi entry chung segment ..", () => {
    expect(paths(zipOf({ "../../etc/x.ts": "x", "a/../../x.ts": "y", "ok.ts": "z" }))).toEqual([
      "ok.ts",
    ]);
    expect(() => paths(zipOf({ "../a.ts": "x", "../b.ts": "y" }))).toThrow();
  });

  it("T-ING-19 loại tên không phải UTF-8 khi tắt cờ bit 11", () => {
    const zip = zipOf({ "badé.ts": "x", "ok.ts": "y" });
    const eocd = findEocd(zip);
    const view = new DataView(zip.buffer);
    const central = view.getUint32(eocd + 16, true);
    view.setUint16(central + 8, view.getUint16(central + 8, true) & ~0x0800, true);

    const r = report();
    expect(listEntries(archive(zip), undefined, r).map((e) => e.path)).toEqual(["ok.ts"]);
    expect(r.skipped.binary).toBe(1);
  });

  it("ING-61 đọc cờ symlink từ external_attrs", () => {
    const zip = zipSync({ link: [strToU8("x"), { attrs: 0xa1ff0000, os: 3 }] });
    expect(readCentralDirectory(zip)?.[0].is_symlink).toBe(true);
  });

  it("ING-63 upload hỏng trả ERR_UPLOAD_INVALID, GitHub hỏng trả ERR_STREAM_CORRUPTED", () => {
    const junk = strToU8("không phải zip");
    expect(() => listEntries(archive(junk))).toThrow(
      expect.objectContaining({ code: "ERR_UPLOAD_INVALID" }),
    );
    expect(() => listEntries(archive(junk, "https://codeload/x"))).toThrow(
      expect.objectContaining({ code: "ERR_STREAM_CORRUPTED" }),
    );
  });

  it("dừng ngay khi signal đã hủy", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => listEntries(archive(zipOf({ "a.ts": "x" })), controller.signal)).toThrow();
  });
});

describe("zip bị cắt", () => {
  it("T-ING-10 chỉ lấy entry trọn vẹn và đọc lại được nội dung", () => {
    const zip = zipOf({
      "repo/src/a.ts": "export const a = 1;\n",
      "repo/src/b.ts": "export const b = 2;\n",
      "repo/src/z.ts": noise(200_000),
    });
    const cut: RawArchive = {
      bytes: zip.subarray(0, zip.length - 60_000),
      stream_cut: true,
      source_url: "https://codeload/x",
    };

    const entries = listEntries(cut);
    expect(entries.map((e) => e.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(entries[0].local_offset).toBeNull();

    const out = inflateSelected(cut.bytes, plan(entries), report());
    expect(out.code.get("src/b.ts")).toBe("export const b = 2;\n");
  });

  it("T-ING-11 cắt khi chưa có entry nào trọn thì báo quá hạn mức", () => {
    const zip = zipOf({ "a.ts": noise(200_000) });
    const cut = { bytes: zip.subarray(0, 1000), stream_cut: true, source_url: "https://x" };
    expect(() => listEntries(cut)).toThrow(
      expect.objectContaining({ code: "ERR_STREAM_QUOTA_EXCEEDED" }),
    );
  });
});

describe("inflateSelected", () => {
  it("T-ING-20 khai man kích thước vẫn dừng ở trần file", () => {
    const zip = zipOf({ "big.ts": noise(1_500_000) });
    const [entry] = listEntries(archive(zip));

    const r = report();
    const out = inflateSelected(zip, plan([{ ...entry, size: 10_240 }]), r);
    expect(out.code.size).toBe(0);
    expect(r.skipped.oversized).toBe(1);
  });

  it("chặn zip bomb khai man theo tỉ lệ nén", () => {
    const zip = zipOf({ "bomb.ts": new Uint8Array(900_000).fill(0x61) });
    const [entry] = listEntries(archive(zip));

    const r = report();
    const out = inflateSelected(zip, plan([{ ...entry, size: 100 }]), r);
    expect(out.code.size).toBe(0);
    expect(r.skipped.oversized).toBe(1);
  });

  it("T-ING-21 dừng ở trần tổng và giữ file đã nhận", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 30; i++) {
      files[`f${String(i).padStart(2, "0")}.ts`] = noise(400 * 1024);
    }
    const zip = zipOf(files);

    const out = inflateSelected(zip, plan(listEntries(archive(zip))), report());
    expect(out.code.size).toBe(20);
    expect(out.inflated_cap_hit).toBe(true);
  });

  it("file minified nhường chỗ, quota tính phần chưa xét", () => {
    const files: Record<string, string> = { "a-min.ts": "x".repeat(2000) };
    for (let i = 0; i < CONFIG.MAX_CLEAN_FILES + 5; i++) {
      files[`f${String(i).padStart(3, "0")}.ts`] = "export {};\n";
    }
    const zip = zipOf(files);

    const r = report();
    const out = inflateSelected(zip, plan(listEntries(archive(zip))), r);
    expect(out.code.size).toBe(CONFIG.MAX_CLEAN_FILES);
    expect(out.code.has("a-min.ts")).toBe(false);
    expect(r.skipped.oversized).toBe(1);
    expect(r.skipped.quota).toBe(5);
  });

  it("đọc được entry lưu không nén", () => {
    const zip = zipSync({ "a.ts": [strToU8("const a = 1;\n"), { level: 0 }] });
    const out = inflateSelected(zip, plan(listEntries(archive(zip))), report());
    expect(out.code.get("a.ts")).toBe("const a = 1;\n");
  });

  it("manifest quá trần bị bỏ kèm warning, file nhỏ vẫn giữ", () => {
    const zip = zipOf({ "package.json": "{}" });
    const [entry] = listEntries(archive(zip));
    const r = report();
    const out = inflateSelected(
      zip,
      {
        manifests: [{ ...entry, size: CONFIG.MAX_MANIFEST_BYTES + 1 }],
        readme: null,
        ordered_candidates: [],
      },
      r,
    );
    expect(out.manifests.size).toBe(0);
    expect(r.warnings).toHaveLength(1);
  });
});

describe("decodeAndFilter", () => {
  const code = { check_minified: true };

  it("T-ING-22 giữ UTF-16LE có BOM", () => {
    const utf16 = Uint8Array.from([0xff, 0xfe, 0x61, 0x00, 0x0a, 0x00]);
    expect(decodeAndFilter(utf16, report(), code)).toBe("a\n");
  });

  it("T-ING-22 byte null là nhị phân", () => {
    const buf = new Uint8Array(200).fill(0x61);
    buf[100] = 0;
    const r = report();
    expect(decodeAndFilter(buf, r, code)).toBeNull();
    expect(r.skipped.binary).toBe(1);
  });

  it("T-ING-22 đổi CRLF và CR thành LF, cắt BOM UTF-8", () => {
    const buf = Uint8Array.from([0xef, 0xbb, 0xbf, ...strToU8("a\r\nb\rc")]);
    expect(decodeAndFilter(buf, report(), code)).toBe("a\nb\nc");
  });

  it("T-ING-22 dòng 1001 ký tự bị coi là minified", () => {
    const r = report();
    expect(decodeAndFilter(strToU8("x".repeat(1001)), r, code)).toBeNull();
    expect(r.skipped.oversized).toBe(1);
    expect(decodeAndFilter(strToU8("x".repeat(1001)), r, { check_minified: false })).not.toBeNull();
  });

  it("T-ING-22 LFS pointer bị bỏ", () => {
    const r = report();
    const pointer = strToU8("version https://git-lfs.github.com/spec/v1\noid sha256:abc\n");
    expect(decodeAndFilter(pointer, r, code)).toBeNull();
    expect(r.skipped.binary).toBe(1);
  });
});
