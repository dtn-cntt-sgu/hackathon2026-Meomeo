import { posix } from "node:path";
import { Inflate, Unzip, UnzipInflate } from "fflate";
import { CONFIG } from "@/contracts";
import type { IngestionReport } from "@/contracts";
import { findEocd } from "./snapshot";
import { IngestionError, type RawArchive, type ZipEntryMeta } from "./types";

const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const ZIP64_MARKER = 0xffffffff;
const UTF8_FLAG = 0x0800;
const CHUNK_BYTES = 16 * 1024;
const LFS_POINTER = "version https://git-lfs.github.com/spec/v1";

type SkipCounter = keyof IngestionReport["skipped"];

/** raw_path giữ tên gốc trong zip để lượt streaming thứ hai tìm lại đúng entry. */
export interface ListedEntry extends ZipEntryMeta {
  raw_path: string;
}

export interface InflatePlan {
  manifests: ZipEntryMeta[];
  readme: ZipEntryMeta | null;
  ordered_candidates: ZipEntryMeta[];
}

function bump(report: IngestionReport | undefined, key: SkipCounter): void {
  if (report) {
    report.skipped[key]++;
  }
}

export function comparePath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function decodeName(name: Uint8Array, flags: number): string | null {
  if ((flags & UTF8_FLAG) === 0 && name.some((byte) => byte >= 0x80)) {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(name);
  } catch {
    return null;
  }
}

/** ING-61: đọc thẳng Central Directory vì fflate không trả external_attrs và cờ mã hóa. */
export function readCentralDirectory(
  bytes: Uint8Array,
  report?: IngestionReport,
): ListedEntry[] | null {
  const eocd = findEocd(bytes);
  if (eocd < 0) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (directoryOffset === ZIP64_MARKER || directoryOffset + directorySize > eocd) {
    return null;
  }

  const entries: ListedEntry[] = [];
  let pos = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (pos + CENTRAL_HEADER_SIZE > eocd || view.getUint32(pos, true) !== CENTRAL_SIGNATURE) {
      return null;
    }
    const flags = view.getUint16(pos + 8, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const size = view.getUint32(pos + 24, true);
    const nameEnd = pos + CENTRAL_HEADER_SIZE + view.getUint16(pos + 28, true);
    const localOffset = view.getUint32(pos + 42, true);
    if (nameEnd > eocd || [compressedSize, size, localOffset].includes(ZIP64_MARKER)) {
      return null;
    }

    const name = decodeName(bytes.subarray(pos + CENTRAL_HEADER_SIZE, nameEnd), flags);
    if (name === null) {
      bump(report, "binary");
    } else {
      entries.push({
        raw_path: name,
        path: name,
        compressed_size: compressedSize,
        size,
        method: view.getUint16(pos + 10, true),
        local_offset: localOffset,
        is_dir: name.endsWith("/"),
        is_symlink: ((view.getUint32(pos + 38, true) >>> 16) & 0xf000) === 0xa000,
        is_encrypted: (flags & 1) === 1,
      });
    }
    pos = nameEnd + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
  return entries;
}

interface StreamedFile {
  name: string;
  method: number;
  compressed_size: number;
  size: number;
  data: Uint8Array | null;
}

/**
 * Duyệt zip theo local header khi không có mục lục. Entry chưa trọn bị bỏ vì không
 * báo final. fflate bản đồng bộ không dừng được một entry nên chỉ ngừng giữ byte.
 */
function scanStream(
  bytes: Uint8Array,
  wants: (name: string) => boolean,
  onFile: (file: StreamedFile) => void,
  signal?: AbortSignal,
): void {
  const unzip = new Unzip((file) => {
    const keep = wants(file.name);
    const chunks: Uint8Array[] = [];
    let total = 0;

    file.ondata = (err, chunk, final) => {
      if (err) {
        return;
      }
      total += chunk.length;
      if (keep && total <= CONFIG.MAX_SINGLE_FILE_BYTES) {
        chunks.push(chunk);
      }
      if (final) {
        onFile({
          name: file.name,
          method: file.compression,
          compressed_size: file.size ?? 0,
          size: total,
          data: keep && total <= CONFIG.MAX_SINGLE_FILE_BYTES ? concat(chunks, total) : null,
        });
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    signal?.throwIfAborted();
    try {
      unzip.push(bytes.subarray(offset, offset + CHUNK_BYTES), false);
    } catch {
      return;
    }
  }
}

export function listEntriesStreaming(bytes: Uint8Array, signal?: AbortSignal): ListedEntry[] {
  const entries: ListedEntry[] = [];
  scanStream(
    bytes,
    () => false,
    (file) => {
      entries.push({
        raw_path: file.name,
        path: file.name,
        compressed_size: file.compressed_size,
        size: file.size,
        method: file.method,
        local_offset: null,
        is_dir: file.name.endsWith("/"),
        is_symlink: false,
        is_encrypted: false,
      });
    },
    signal,
  );
  return entries;
}

function isMacJunk(path: string): boolean {
  const segments = path.split("/").filter((segment) => segment !== "");
  const base = segments[segments.length - 1] ?? "";
  return base.startsWith("._") || segments.some((s) => s.toLowerCase() === "__macosx");
}

/** ING-60. Loại path thoát gốc trước khi cắt segment chung để không cắt mất dấu `../`. */
function normalizeEntries(raw: ListedEntry[], report?: IngestionReport): ListedEntry[] {
  const clean: ListedEntry[] = [];
  for (const entry of raw) {
    const slashed = entry.raw_path.replace(/\\/g, "/");
    const path = posix.normalize(slashed);
    const escapes = path === ".." || path.startsWith("../") || path.startsWith("/");
    if (isMacJunk(slashed) || escapes || path.includes("\0")) {
      bump(report, "garbage");
    } else if (path !== "." && path !== "./") {
      clean.push({ ...entry, path, is_dir: entry.is_dir || path.endsWith("/") });
    }
  }

  const first = clean[0]?.path.split("/")[0] ?? "";
  const prefix = `${first}/`;
  const shared = clean.length > 0 && clean.every((entry) => entry.path.startsWith(prefix));

  const seen = new Set<string>();
  const unique: ListedEntry[] = [];
  for (const entry of clean) {
    const path = shared ? entry.path.slice(prefix.length) : entry.path;
    if (path === "") {
      continue;
    }
    if (seen.has(path)) {
      bump(report, "garbage");
      continue;
    }
    seen.add(path);
    unique.push({ ...entry, path });
  }
  return unique.sort(comparePath);
}

export function listEntries(
  a: RawArchive,
  signal?: AbortSignal,
  report?: IngestionReport,
): ListedEntry[] {
  signal?.throwIfAborted();
  const central = a.stream_cut ? null : readCentralDirectory(a.bytes, report);
  const entries = normalizeEntries(central ?? listEntriesStreaming(a.bytes, signal), report);

  if (entries.length > 0) {
    return entries;
  }
  if (a.stream_cut) {
    throw new IngestionError("ERR_STREAM_QUOTA_EXCEEDED");
  }
  if (a.source_url === "") {
    throw new IngestionError("ERR_UPLOAD_INVALID");
  }
  if (central?.length === 0) {
    return [];
  }
  throw new IngestionError("ERR_STREAM_CORRUPTED");
}

/** Không tin kích thước khai báo: đếm byte thật và dừng khi vượt limit. */
function inflateEntry(
  bytes: Uint8Array,
  entry: ZipEntryMeta,
  limit: number,
  report: IngestionReport,
): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.local_offset;
  if (
    local === null ||
    local + LOCAL_HEADER_SIZE > bytes.length ||
    view.getUint32(local, true) !== LOCAL_SIGNATURE
  ) {
    report.skipped.binary++;
    return null;
  }

  const start =
    local + LOCAL_HEADER_SIZE + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const end = start + entry.compressed_size;
  if (end > bytes.length) {
    report.skipped.binary++;
    return null;
  }

  const data = bytes.subarray(start, end);
  if (entry.method === 0) {
    if (data.length > limit) {
      report.skipped.oversized++;
      return null;
    }
    return data;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflater = new Inflate((chunk) => {
    total += chunk.length;
    if (total <= limit) {
      chunks.push(chunk);
    }
  });

  try {
    for (let offset = 0; offset < data.length && total <= limit; offset += CHUNK_BYTES) {
      const next = offset + CHUNK_BYTES;
      inflater.push(data.subarray(offset, next), next >= data.length);
    }
  } catch {
    report.skipped.binary++;
    return null;
  }

  if (total > limit) {
    report.skipped.oversized++;
    return null;
  }
  return concat(chunks, total);
}

/** Lượt 2 khi không có mục lục: chỉ giữ phần ứng viên còn lọt được trần tổng. */
function prefetchStream(
  bytes: Uint8Array,
  plan: InflatePlan,
  signal?: AbortSignal,
): Map<string, Uint8Array> {
  const wanted = new Map<string, string>();
  const add = (entry: ZipEntryMeta) => {
    wanted.set((entry as ListedEntry).raw_path ?? entry.path, entry.path);
  };

  plan.manifests.forEach(add);
  if (plan.readme) {
    add(plan.readme);
  }
  let budget = CONFIG.MAX_INFLATED_BYTES;
  for (const entry of plan.ordered_candidates) {
    budget -= entry.size;
    if (budget < 0) {
      break;
    }
    add(entry);
  }

  const found = new Map<string, Uint8Array>();
  scanStream(
    bytes,
    (name) => wanted.has(name),
    (file) => {
      const path = wanted.get(file.name);
      if (path !== undefined && file.data) {
        found.set(path, file.data);
      }
    },
    signal,
  );
  return found;
}

export function inflateSelected(
  bytes: Uint8Array,
  plan: InflatePlan,
  report: IngestionReport,
  signal?: AbortSignal,
): {
  code: Map<string, string>;
  manifests: Map<string, string>;
  readme: string | null;
  inflated_cap_hit: boolean;
} {
  const planned = [...plan.manifests, ...plan.ordered_candidates];
  if (plan.readme) {
    planned.push(plan.readme);
  }
  const streamed = planned.some((entry) => entry.local_offset === null)
    ? prefetchStream(bytes, plan, signal)
    : null;

  const code = new Map<string, string>();
  const manifests = new Map<string, string>();
  let readme: string | null = null;
  let inflatedTotal = 0;
  let capHit = false;

  const read = (entry: ZipEntryMeta, limit: number, checkMinified: boolean): string | null => {
    signal?.throwIfAborted();
    const buf = streamed
      ? (streamed.get(entry.path) ?? null)
      : inflateEntry(bytes, entry, limit, report);
    if (buf === null) {
      return null;
    }
    inflatedTotal += buf.length;
    return decodeAndFilter(buf, report, { check_minified: checkMinified });
  };
  const overCap = (entry: ZipEntryMeta): boolean => {
    capHit = capHit || inflatedTotal + entry.size > CONFIG.MAX_INFLATED_BYTES;
    return capHit;
  };

  for (const entry of plan.manifests) {
    if (entry.size > CONFIG.MAX_MANIFEST_BYTES) {
      report.warnings.push(`Bỏ qua ${entry.path} vì tệp cấu hình quá lớn.`);
      continue;
    }
    if (overCap(entry)) {
      break;
    }
    const text = read(entry, CONFIG.MAX_MANIFEST_BYTES, false);
    if (text !== null) {
      manifests.set(entry.path, text);
    }
  }

  if (plan.readme && !overCap(plan.readme)) {
    readme = read(plan.readme, CONFIG.MAX_MANIFEST_BYTES, false);
  }

  for (let i = 0; i < plan.ordered_candidates.length; i++) {
    const entry = plan.ordered_candidates[i];
    if (code.size >= CONFIG.MAX_CLEAN_FILES) {
      report.skipped.quota += plan.ordered_candidates.length - i;
      break;
    }
    if (overCap(entry)) {
      break;
    }
    // ING-88 chỉ chặn tỉ lệ nén với ứng viên code, manifest và README đã có trần riêng.
    const limit = Math.min(
      CONFIG.MAX_SINGLE_FILE_BYTES,
      entry.compressed_size * CONFIG.MAX_COMPRESSION_RATIO,
    );
    const text = read(entry, limit, true);
    if (text !== null) {
      code.set(entry.path, text);
    }
  }

  return { code, manifests, readme, inflated_cap_hit: capHit };
}

function decodeBytes(buf: Uint8Array): string | null {
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf);
  }
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf);
  }
  if (buf.subarray(0, CONFIG.BINARY_SNIFF_BYTES).includes(0)) {
    return null;
  }
  return new TextDecoder("utf-8").decode(buf);
}

function looksMinified(text: string): boolean {
  const lines = text.split("\n");
  return (
    lines.some((line) => line.length > CONFIG.MAX_LINE_LENGTH) ||
    text.length / lines.length > CONFIG.MAX_AVG_LINE_LENGTH
  );
}

export function decodeAndFilter(
  buf: Uint8Array,
  report: IngestionReport,
  opts: { check_minified: boolean },
): string | null {
  const decoded = decodeBytes(buf);
  if (decoded === null || decoded.startsWith(LFS_POINTER)) {
    report.skipped.binary++;
    return null;
  }

  const text = decoded.replace(/\r\n?/g, "\n");
  if (opts.check_minified && looksMinified(text)) {
    report.skipped.oversized++;
    return null;
  }
  return text;
}
