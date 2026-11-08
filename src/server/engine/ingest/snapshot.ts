import { createHash } from "node:crypto";
import type { RepoSnapshotKey } from "@/contracts";
import type { RawArchive } from "./types";

const EOCD_SIGNATURE = 0x06054b50;
const EOCD_SIZE = 22;
const MAX_COMMENT_BYTES = 65535;
const COMMIT_SHA_RE = /^[0-9a-f]{40}$/;

/** ING-50: dò ngược tìm End Of Central Directory, không thấy trả -1. */
export function findEocd(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.length - EOCD_SIZE - MAX_COMMENT_BYTES);
  for (let i = bytes.length - EOCD_SIZE; i >= lowest; i--) {
    if (view.getUint32(i, true) !== EOCD_SIGNATURE) {
      continue;
    }
    if (i + EOCD_SIZE + view.getUint16(i + 20, true) <= bytes.length) {
      return i;
    }
  }
  return -1;
}

export function readEocdComment(bytes: Uint8Array): string | null {
  const eocd = findEocd(bytes);
  if (eocd < 0) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = eocd + EOCD_SIZE;
  const comment = bytes.subarray(start, start + view.getUint16(eocd + 20, true));
  return new TextDecoder().decode(comment).trim();
}

export function computeArchiveHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Upload có source_url rỗng, luôn dùng ARCHIVE_HASH dù zip mang comment SHA (ING-52).
 * Zip bị cắt không còn EOCD thật nên không đọc comment.
 */
export function computeSnapshot(
  a: RawArchive,
  ctx: { repo_key: string; ref: string | null; ref_label: string | null; explicit_subdir: string },
): RepoSnapshotKey {
  const fromGithub = a.source_url !== "";
  let sha: string | null = null;

  if (fromGithub) {
    if (ctx.ref !== null && COMMIT_SHA_RE.test(ctx.ref)) {
      sha = ctx.ref;
    } else if (!a.stream_cut) {
      const comment = readEocdComment(a.bytes);
      sha = comment !== null && COMMIT_SHA_RE.test(comment) ? comment : null;
    }
  }

  return {
    source: fromGithub ? "GITHUB" : "ZIP",
    repo_key: ctx.repo_key,
    snapshot_id: sha ?? computeArchiveHash(a.bytes),
    snapshot_id_kind: sha === null ? "ARCHIVE_HASH" : "COMMIT_SHA",
    subdir: ctx.explicit_subdir,
    ref_label: fromGithub ? ctx.ref_label : null,
  };
}
