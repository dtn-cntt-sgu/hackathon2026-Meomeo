import { describe, expect, it, vi, beforeEach } from "vitest";
import { CONFIG } from "@/contracts";
import type { NodeAnalysis, StaticEngineResult } from "@/contracts";
import fixtureJson from "../engine/__fixtures__/shop-api.json";
import * as cacheModule from "../cache";
import { runEngine } from "../engine";
import { ApiHttpError } from "../errors";
import { authenticateRequest } from "../auth";
import {
  createOrResumeSession,
  getSessionStaticResult,
  loadSessionProgress,
  type SessionRecord,
  touchSession,
  verifySessionOwnership,
} from "../session";
import { POST } from "@/app/api/ingest/route";

const fixture = fixtureJson as unknown as StaticEngineResult;

const VALID_USER_ID = "00000000-0000-4000-8000-000000000001";
const VALID_SESSION_ID = "11111111-1111-4111-8111-111111111111";

const { mockSql, mockTx } = vi.hoisted(() => ({
  mockSql: vi.fn(),
  mockTx: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  sql: mockSql,
  db: { sql: mockSql, tx: mockTx },
}));

// Engine thật cần mạng và grammar: test route chỉ mock runEngine, giữ toClientResult thật.
vi.mock("@/server/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/engine")>();
  return { ...actual, runEngine: vi.fn() };
});

vi.mock("@/server/auth", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/server/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/session")>();
  return {
    ...actual,
    verifySessionOwnership: vi.fn(),
    getSessionStaticResult: vi.fn(),
    touchSession: vi.fn(),
    createOrResumeSession: vi.fn(),
    loadSessionProgress: vi.fn(),
  };
});

function makeDummySessionRecord(): SessionRecord {
  return {
    id: VALID_SESSION_ID,
    user_id: VALID_USER_ID,
    source: "GITHUB",
    repo_key: "demo/shop-api",
    snapshot_id: "3f9a1c7e5b2d4a8f6c0e1d9b7a5c3e2f4b6d8a0c",
    snapshot_id_kind: "COMMIT_SHA",
    subdir: "",
    ref_label: "main",
    repo_name: "shop-api",
    engine_version: CONFIG.ENGINE_VERSION,
    graph_skeleton: [],
    tokens_used: 0,
    explain_count: 0,
    created_at: new Date(),
    last_active_at: new Date(),
  };
}

describe("POST /api/ingest route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runEngine).mockImplementation(async () => {
      const result = structuredClone(fixture);
      result.engine_version = CONFIG.ENGINE_VERSION;
      return result;
    });
    mockSql.mockResolvedValue([]);
    vi.mocked(authenticateRequest).mockResolvedValue({
      id: VALID_USER_ID,
      email: "test@example.com",
      user_metadata: {},
    });
    vi.mocked(loadSessionProgress).mockResolvedValue({
      session_id: VALID_SESSION_ID,
      nodes: {},
      tokens_used: 0,
    });
    vi.mocked(touchSession).mockResolvedValue();
  });

  it("không token (authenticateRequest ném ERR_UNAUTHENTICATED) ⇒ 401", async () => {
    vi.mocked(authenticateRequest).mockRejectedValueOnce(
      new ApiHttpError("ERR_UNAUTHENTICATED"),
    );

    const req = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: "https://github.com/demo/shop-api" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("ERR_UNAUTHENTICATED");
  });

  it("{ repo_url } ⇒ 200, có session_id, result.nodes.length bằng số node fixture, resumed: false", async () => {
    const session = makeDummySessionRecord();
    vi.mocked(createOrResumeSession).mockResolvedValueOnce({
      session,
      resumed: false,
    });

    const req = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: "https://github.com/demo/shop-api" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      session_id: string;
      result: { nodes: unknown[] };
      resumed: boolean;
      from_cache: boolean;
    };
    expect(json.session_id).toBe(VALID_SESSION_ID);
    expect(json.result.nodes.length).toBe(fixture.nodes.length);
    expect(json.resumed).toBe(false);
    expect(json.from_cache).toBe(false);
  });

  it("text của body response KHÔNG chứa symbol_whitelist, suspicious_instruction_files, readme_excerpt, manifest_description", async () => {
    const session = makeDummySessionRecord();
    vi.mocked(createOrResumeSession).mockResolvedValueOnce({
      session,
      resumed: false,
    });

    const req = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: "https://github.com/demo/shop-api" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).not.toContain("symbol_whitelist");
    expect(text).not.toContain("suspicious_instruction_files");
    expect(text).not.toContain("readme_excerpt");
    expect(text).not.toContain("manifest_description");
  });

  it("{ session_id } ⇒ không gọi runEngine, resumed: true, from_cache: true", async () => {
    const session = makeDummySessionRecord();
    vi.mocked(verifySessionOwnership).mockResolvedValueOnce(session);
    vi.mocked(getSessionStaticResult).mockResolvedValueOnce(fixture);

    const req = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: VALID_SESSION_ID }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      session_id: string;
      resumed: boolean;
      from_cache: boolean;
    };
    expect(json.session_id).toBe(VALID_SESSION_ID);
    expect(json.resumed).toBe(true);
    expect(json.from_cache).toBe(true);

    expect(vi.mocked(runEngine)).not.toHaveBeenCalled();
    expect(vi.mocked(touchSession)).toHaveBeenCalledWith(VALID_SESSION_ID);
  });

  it("body rỗng, JSON hỏng, { repo_url: '' } ⇒ 400 ERR_INVALID_GITHUB_URL", async () => {
    // 1. Body rỗng
    const reqEmpty = new Request("http://localhost/api/ingest", {
      method: "POST",
    });
    const resEmpty = await POST(reqEmpty);
    expect(resEmpty.status).toBe(400);
    const jsonEmpty = (await resEmpty.json()) as { error: { code: string } };
    expect(jsonEmpty.error.code).toBe("ERR_INVALID_GITHUB_URL");

    // 2. JSON hỏng
    const reqMalformed = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    const resMalformed = await POST(reqMalformed);
    expect(resMalformed.status).toBe(400);
    const jsonMalformed = (await resMalformed.json()) as { error: { code: string } };
    expect(jsonMalformed.error.code).toBe("ERR_INVALID_GITHUB_URL");

    // 3. repo_url rỗng sau khi trim
    const reqBlankUrl = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: "   " }),
    });
    const resBlankUrl = await POST(reqBlankUrl);
    expect(resBlankUrl.status).toBe(400);
    const jsonBlankUrl = (await resBlankUrl.json()) as { error: { code: string } };
    expect(jsonBlankUrl.error.code).toBe("ERR_INVALID_GITHUB_URL");
  });

  it("multipart thiếu archive hoặc file không phải .zip ⇒ 400 ERR_UPLOAD_INVALID; file vượt trần ⇒ 413", async () => {
    // 1. Thiếu archive
    const formNoArchive = new FormData();
    formNoArchive.append("other", "value");
    const resNoArchive = await POST(
      new Request("http://localhost/api/ingest", {
        method: "POST",
        body: formNoArchive,
      }),
    );
    expect(resNoArchive.status).toBe(400);
    const jsonNoArchive = (await resNoArchive.json()) as { error: { code: string } };
    expect(jsonNoArchive.error.code).toBe("ERR_UPLOAD_INVALID");

    // 2. File không phải .zip
    const formNotZip = new FormData();
    const txtFile = new File(["dummy text"], "archive.txt", { type: "text/plain" });
    formNotZip.append("archive", txtFile);
    const resNotZip = await POST(
      new Request("http://localhost/api/ingest", {
        method: "POST",
        body: formNotZip,
      }),
    );
    expect(resNotZip.status).toBe(400);
    const jsonNotZip = (await resNotZip.json()) as { error: { code: string } };
    expect(jsonNotZip.error.code).toBe("ERR_UPLOAD_INVALID");

    // 3. File vượt CONFIG.MAX_UPLOAD_BYTES ⇒ 413
    const formHuge = new FormData();
    const hugeFile = new File(
      [new Uint8Array(CONFIG.MAX_UPLOAD_BYTES + 1)],
      "project.zip",
      { type: "application/zip" },
    );
    formHuge.append("archive", hugeFile);

    const resHuge = await POST(
      new Request("http://localhost/api/ingest", {
        method: "POST",
        body: formHuge,
      }),
    );
    expect(resHuge.status).toBe(413);
    const jsonHuge = (await resHuge.json()) as { error: { code: string } };
    expect(jsonHuge.error.code).toBe("ERR_STREAM_QUOTA_EXCEEDED");
  });

  it("lỗi lạ từ createOrResumeSession ⇒ 500, body không lộ nội dung lỗi gốc", async () => {
    vi.mocked(createOrResumeSession).mockRejectedValueOnce(
      new Error("Secret database credentials leaked error!"),
    );

    const req = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: "https://github.com/demo/shop-api" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);

    const text = await res.text();
    expect(text).not.toContain("Secret database credentials");

    const json = JSON.parse(text) as { error: { code: string } };
    expect(json.error.code).toBe("ERR_PERSISTENCE_UNAVAILABLE");
  });

  it("resumed = true thì setEngineResultCache không được gọi với built và response trả result từ getSessionStaticResult", async () => {
    const session = makeDummySessionRecord();
    vi.mocked(createOrResumeSession).mockResolvedValueOnce({
      session,
      resumed: true,
    });

    const resumedResult: StaticEngineResult = {
      ...fixture,
      repo_name: "resumed-persisted-repo",
    };
    vi.mocked(getSessionStaticResult).mockResolvedValueOnce(resumedResult);

    const spySetCache = vi.spyOn(cacheModule, "setEngineResultCache");

    const req = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: "https://github.com/demo/shop-api" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      session_id: string;
      result: { repo_name: string };
      resumed: boolean;
      from_cache: boolean;
    };
    expect(json.session_id).toBe(VALID_SESSION_ID);
    expect(json.result.repo_name).toBe("resumed-persisted-repo");
    expect(json.resumed).toBe(true);
    expect(json.from_cache).toBe(true);

    expect(spySetCache).not.toHaveBeenCalled();
    expect(vi.mocked(getSessionStaticResult)).toHaveBeenCalledWith(
      session,
      VALID_USER_ID,
    );
  });

  it("payload skeleton_only vẫn có trong analyses", async () => {
    const session = makeDummySessionRecord();
    vi.mocked(createOrResumeSession).mockResolvedValueOnce({
      session,
      resumed: false,
    });

    const targetNode = fixture.nodes[0];
    const targetKey = cacheModule.makeAnalysisCacheKey(
      fixture.snapshot,
      CONFIG.ENGINE_VERSION,
      targetNode.id,
    );

    const skeletonPayload: NodeAnalysis = {
      node_id: targetNode.id,
      skeleton_only: true,
      skills: [],
      architecture: { patterns: [], summary: "Skeleton summary" },
      steps: [],
      strengths: [],
      weak_points: [],
    };

    mockSql.mockImplementation((first: unknown) =>
      Array.isArray(first) && "raw" in first
        ? Promise.resolve([{ cache_key: targetKey, payload: skeletonPayload }])
        : ("KEYS" as unknown as Promise<unknown[]>),
    );

    try {
      const req = new Request("http://localhost/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: "https://github.com/demo/shop-api" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        analyses: Record<string, { node_id: string; skeleton_only: boolean }>;
      };

      expect(json.analyses[targetNode.id]).toBeDefined();
      expect(json.analyses[targetNode.id].skeleton_only).toBe(true);
      expect(json.analyses[targetNode.id].node_id).toBe(targetNode.id);
    } finally {
      mockSql.mockReset();
      mockSql.mockResolvedValue([] as unknown as never);
    }
  });
});
