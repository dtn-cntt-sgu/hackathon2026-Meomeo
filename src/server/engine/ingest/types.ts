import type { ApiError, IngestionErrorCode, IngestionReport, LanguageId } from "@/contracts";
import { ApiHttpError } from "@/server/errors";

export interface RawArchive {
  bytes: Uint8Array;
  stream_cut: boolean;
  source_url: string;
}

export class IngestionError extends ApiHttpError {
  declare readonly code: IngestionErrorCode;

  constructor(code: IngestionErrorCode, details?: ApiError["error"]["details"]) {
    super(code, undefined, details);
    this.name = "IngestionError";
    Object.setPrototypeOf(this, IngestionError.prototype);
  }
}

export interface ZipEntryMeta {
  path: string;
  compressed_size: number;
  size: number;
  method: number;
  local_offset: number | null;
  is_dir: boolean;
  is_symlink: boolean;
  is_encrypted: boolean;
}

export type EntryClass = "CODE" | "NO_GRAMMAR" | "MANIFEST" | "README" | "SKIP";

export interface ClassifiedEntry extends ZipEntryMeta {
  cls: EntryClass;
  language: LanguageId | null;
  skip_reason: keyof IngestionReport["skipped"] | null;
}

export interface ScopeDecision {
  root_dir_offset: string;
  is_monorepo: boolean;
  candidates: string[];
  explicit: boolean;
}

// TH-09 dựng DEFAULT_LANGUAGE_REGISTRY
export interface LanguageRegistry {
  by_extension: Readonly<Record<string, LanguageId>>;
  with_grammar: readonly LanguageId[];
  manifest_files: readonly string[];
}
