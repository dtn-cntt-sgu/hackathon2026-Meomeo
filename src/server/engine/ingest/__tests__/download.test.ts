import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts";
import { downloadArchive, receiveUpload } from "../download";

function makeStream(
  chunks: Uint8Array[],
  onCancel?: () => void,
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe("download.ts - downloadArchive & receiveUpload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("downloadArchive", () => {
    it("tải bình thường => đủ byte, stream_cut: false, source_url đúng", async () => {
      const chunk1 = new Uint8Array([1, 2, 3]);
      const chunk2 = new Uint8Array([4, 5, 6]);
      const stream = makeStream([chunk1, chunk2]);
      const mockResponse = new Response(stream, { status: 200 });
      Object.defineProperty(mockResponse, "url", {
        value: "https://codeload.github.com/owner/repo/zip/final-sha",
      });

      const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
      vi.stubGlobal("fetch", mockFetch);

      const res = await downloadArchive("https://github.com/owner/repo/archive/HEAD.zip");
      expect(res.bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
      expect(res.stream_cut).toBe(false);
      expect(res.source_url).toBe("https://codeload.github.com/owner/repo/zip/final-sha");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("tổng byte vượt CONFIG.MAX_STREAM_BYTES qua nhiều chunk => bytes.length === CONFIG.MAX_STREAM_BYTES, stream_cut: true, reader bị cancel", async () => {
      // CONFIG.MAX_STREAM_BYTES = 15 * 1024 * 1024 = 15728640
      const chunk1 = new Uint8Array(10 * 1024 * 1024);
      const chunk2 = new Uint8Array(10 * 1024 * 1024);
      const chunk3 = new Uint8Array(10 * 1024 * 1024);
      chunk1.fill(1);
      chunk2.fill(2);
      chunk3.fill(3);

      let cancelCalled = false;
      const stream = makeStream([chunk1, chunk2, chunk3], () => {
        cancelCalled = true;
      });
      const mockResponse = new Response(stream, { status: 200 });

      const mockFetch = vi.fn().mockResolvedValueOnce(mockResponse);
      vi.stubGlobal("fetch", mockFetch);

      const res = await downloadArchive("https://github.com/owner/repo/archive/HEAD.zip");
      expect(res.bytes.length).toBe(CONFIG.MAX_STREAM_BYTES);
      expect(res.stream_cut).toBe(true);
      expect(cancelCalled).toBe(true);
      expect(res.bytes[0]).toBe(1);
      expect(res.bytes[10 * 1024 * 1024]).toBe(2);
    });

    it("404 => ERR_BRANCH_NOT_FOUND, 1 lần gọi", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        downloadArchive("https://github.com/owner/repo/archive/HEAD.zip"),
      ).rejects.toMatchObject({
        code: "ERR_BRANCH_NOT_FOUND",
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("429 => ERR_GITHUB_RATE_LIMIT_CDN, 1 lần gọi", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        downloadArchive("https://github.com/owner/repo/archive/HEAD.zip"),
      ).rejects.toMatchObject({
        code: "ERR_GITHUB_RATE_LIMIT_CDN",
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("451 => ERR_REPO_UNAVAILABLE_451, 1 lần gọi", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 451 }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        downloadArchive("https://github.com/owner/repo/archive/HEAD.zip"),
      ).rejects.toMatchObject({
        code: "ERR_REPO_UNAVAILABLE_451",
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("503 rồi 200 => thành công, 2 lần gọi (fake timer)", async () => {
      vi.useFakeTimers();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(
          new Response(makeStream([new Uint8Array([7, 8, 9])]), { status: 200 }),
        );
      vi.stubGlobal("fetch", mockFetch);

      const promise = downloadArchive("https://github.com/owner/repo/archive/HEAD.zip");
      await vi.advanceTimersByTimeAsync(CONFIG.STREAM_RETRY_DELAY_MS + 20);
      const res = await promise;

      expect(res.bytes).toEqual(new Uint8Array([7, 8, 9]));
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("503 2 lần => ERR_STREAM_CORRUPTED (fake timer)", async () => {
      vi.useFakeTimers();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 503 }));
      vi.stubGlobal("fetch", mockFetch);

      const promise = downloadArchive("https://github.com/owner/repo/archive/HEAD.zip");
      const assertion = expect(promise).rejects.toMatchObject({ code: "ERR_STREAM_CORRUPTED" });
      await vi.advanceTimersByTimeAsync(CONFIG.STREAM_RETRY_DELAY_MS + 20);
      await assertion;
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("signal ngoài đã hủy => ném lỗi hủy, không gọi lần 2", async () => {
      const controller = new AbortController();
      controller.abort(new DOMException("User aborted", "AbortError"));

      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        downloadArchive("https://github.com/owner/repo/archive/HEAD.zip", controller.signal),
      ).rejects.toThrow("User aborted");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("receiveUpload", () => {
    it("thân multipart có file .zip bắt đầu PK\\x03\\x04 => đúng tên và byte", async () => {
      const formData = new FormData();
      const zipData = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02]);
      const file = new File([zipData], "test-repo.zip", { type: "application/zip" });
      formData.append("archive", file);

      const req = new Request("http://localhost", {
        method: "POST",
        body: formData,
      });

      const res = await receiveUpload(req.body!, req.headers.get("content-type")!);
      expect(res.file_name).toBe("test-repo.zip");
      expect(res.bytes).toEqual(zipData);
    });

    it("thân multipart có file .zip rỗng bắt đầu PK\\x05\\x06 => đúng tên và byte", async () => {
      const formData = new FormData();
      const zipData = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00]);
      const file = new File([zipData], "empty.zip", { type: "application/zip" });
      formData.append("archive", file);

      const req = new Request("http://localhost", {
        method: "POST",
        body: formData,
      });

      const res = await receiveUpload(req.body!, req.headers.get("content-type")!);
      expect(res.file_name).toBe("empty.zip");
      expect(res.bytes).toEqual(zipData);
    });

    it("thiếu archive => ERR_UPLOAD_INVALID", async () => {
      const formData = new FormData();
      formData.append("other_field", "some value");

      const req = new Request("http://localhost", {
        method: "POST",
        body: formData,
      });

      await expect(
        receiveUpload(req.body!, req.headers.get("content-type")!),
      ).rejects.toMatchObject({
        code: "ERR_UPLOAD_INVALID",
      });
    });

    it("file không bắt đầu PK => ERR_UPLOAD_INVALID", async () => {
      const formData = new FormData();
      const notZip = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const file = new File([notZip], "corrupted.zip");
      formData.append("archive", file);

      const req = new Request("http://localhost", {
        method: "POST",
        body: formData,
      });

      await expect(
        receiveUpload(req.body!, req.headers.get("content-type")!),
      ).rejects.toMatchObject({
        code: "ERR_UPLOAD_INVALID",
      });
    });

    it("thân vượt CONFIG.MAX_UPLOAD_BYTES => ERR_STREAM_QUOTA_EXCEEDED", async () => {
      // CONFIG.MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024 = 4718592
      const oversizedChunk = new Uint8Array(CONFIG.MAX_UPLOAD_BYTES + 100);
      let cancelCalled = false;
      const stream = makeStream([oversizedChunk], () => {
        cancelCalled = true;
      });

      await expect(
        receiveUpload(stream, "multipart/form-data; boundary=---boundary"),
      ).rejects.toMatchObject({
        code: "ERR_STREAM_QUOTA_EXCEEDED",
      });
      expect(cancelCalled).toBe(true);
    });
  });
});
