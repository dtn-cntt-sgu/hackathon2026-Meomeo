import { CONFIG } from "@/contracts";
import { IngestionError, type RawArchive } from "./types";

/**
 * Tải file zip repo từ GitHub về RAM có trần byte và thời gian timeout.
 * Tối đa 2 lần thử; nếu vượt CONFIG.MAX_STREAM_BYTES thì cắt cụt và đặt stream_cut = true.
 */
export async function downloadArchive(
  url: string,
  signal?: AbortSignal,
): Promise<RawArchive> {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("This operation was aborted", "AbortError");
    }

    const attemptController = new AbortController();
    const timer = setTimeout(() => {
      attemptController.abort();
    }, CONFIG.STREAM_TIMEOUT_MS);

    const signals: AbortSignal[] = [attemptController.signal];
    if (signal) {
      signals.push(signal);
    }
    const combinedSignal = AbortSignal.any(signals);

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "SimpliFey" },
        signal: combinedSignal,
      });

      // Lỗi HTTP không thể thử lại
      if (res.status === 404) {
        throw new IngestionError("ERR_BRANCH_NOT_FOUND");
      }
      if (res.status === 429 || res.status === 403) {
        throw new IngestionError("ERR_GITHUB_RATE_LIMIT_CDN");
      }
      if (res.status === 451) {
        throw new IngestionError("ERR_REPO_UNAVAILABLE_451");
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("Missing response body");
      }

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      let streamCut = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            if (totalBytes + value.byteLength > CONFIG.MAX_STREAM_BYTES) {
              const needed = CONFIG.MAX_STREAM_BYTES - totalBytes;
              if (needed > 0) {
                chunks.push(value.subarray(0, needed));
                totalBytes += needed;
              }
              streamCut = true;
              await reader.cancel();
              break;
            } else {
              chunks.push(value);
              totalBytes += value.byteLength;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const fullBytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        fullBytes.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return {
        bytes: fullBytes,
        stream_cut: streamCut,
        source_url: res.url || url,
      };
    } catch (err) {
      // signal ngoài hủy thì ném ngay, không thử lại
      if (signal?.aborted) {
        throw signal.reason ?? (err instanceof Error ? err : new DOMException("This operation was aborted", "AbortError"));
      }

      // Các lỗi IngestionError không thử lại
      if (err instanceof IngestionError) {
        throw err;
      }

      if (attempt < maxAttempts) {
        await new Promise<void>((resolve, reject) => {
          const retryTimer = setTimeout(resolve, CONFIG.STREAM_RETRY_DELAY_MS);
          if (signal) {
            const onAbort = () => {
              clearTimeout(retryTimer);
              reject(signal.reason ?? new DOMException("This operation was aborted", "AbortError"));
            };
            signal.addEventListener("abort", onAbort, { once: true });
          }
        });
      } else {
        if (attemptController.signal.aborted && !signal?.aborted) {
          throw new IngestionError("ERR_STREAM_TIMEOUT");
        }
        throw new IngestionError("ERR_STREAM_CORRUPTED");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new IngestionError("ERR_STREAM_CORRUPTED");
}

/**
 * Nhận file zip được tải lên qua multipart/form-data.
 * Trần áp cho cả thân multipart, client đã chặn file vượt trần.
 */
export async function receiveUpload(
  body: ReadableStream<Uint8Array>,
  contentType: string,
): Promise<{ file_name: string; bytes: Uint8Array }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > CONFIG.MAX_UPLOAD_BYTES) {
          await reader.cancel();
          throw new IngestionError("ERR_STREAM_QUOTA_EXCEEDED");
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  const uploadBuffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    uploadBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let formData: FormData;
  try {
    const res = new Response(uploadBuffer, {
      headers: { "content-type": contentType },
    });
    formData = await res.formData();
  } catch {
    throw new IngestionError("ERR_UPLOAD_INVALID");
  }

  const archive = formData.get("archive");
  if (!archive || typeof archive === "string" || !(archive instanceof Blob)) {
    throw new IngestionError("ERR_UPLOAD_INVALID");
  }

  const fileBytes = new Uint8Array(await archive.arrayBuffer());
  const fileName = archive instanceof File ? archive.name : "archive.zip";

  // 4 byte đầu phải là PK\x03\x04 hoặc PK\x05\x06
  if (fileBytes.length < 4) {
    throw new IngestionError("ERR_UPLOAD_INVALID");
  }

  const isPk0304 =
    fileBytes[0] === 0x50 &&
    fileBytes[1] === 0x4b &&
    fileBytes[2] === 0x03 &&
    fileBytes[3] === 0x04;
  const isPk0506 =
    fileBytes[0] === 0x50 &&
    fileBytes[1] === 0x4b &&
    fileBytes[2] === 0x05 &&
    fileBytes[3] === 0x06;

  if (!isPk0304 && !isPk0506) {
    throw new IngestionError("ERR_UPLOAD_INVALID");
  }

  return {
    file_name: fileName,
    bytes: fileBytes,
  };
}
