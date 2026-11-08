import { createHash } from "node:crypto";
import { CONFIG } from "@/contracts";
import type { HybridArchitecturalNode, NodeTitleSource } from "@/contracts";
import type { Candidate, EngineContext } from "./types";

const ACRONYMS = new Set(["ID", "UI", "AI", "IO", "OS", "QR"]);

const TECH_TOKENS = new Set([
  "controller",
  "ctrl",
  "service",
  "svc",
  "repository",
  "repo",
  "dao",
  "model",
  "entity",
  "dto",
  "schema",
  "handler",
  "handle",
  "impl",
  "manager",
  "helper",
  "util",
  "utils",
  "router",
  "route",
  "routes",
  "view",
  "views",
  "api",
  "endpoint",
  "module",
  "index",
  "main",
  "base",
  "abstract",
  "interface",
  "default",
  "async",
  "sync",
]);

export const ACTION_SEGMENTS = new Set([
  "cancel",
  "login",
  "logout",
  "register",
  "search",
  "verify",
  "refresh",
  "reset",
  "health",
]);

const GENERIC_NAMES = new Set([
  "main",
  "run",
  "start",
  "init",
  "handler",
  "callback",
  "cb",
  "fn",
  "func",
  "process",
  "execute",
  "exec",
  "test",
  "tmp",
  "temp",
  "foo",
  "bar",
  "<module>",
  "default",
  "anonymous",
]);

const GENERIC_DIRS = new Set([
  "src",
  "lib",
  "app",
  "internal",
  "pkg",
  "cmd",
  "main",
  "java",
  "kotlin",
  "com",
  "org",
  "net",
  "controllers",
  "services",
  "repositories",
  "repos",
  "routes",
  "handlers",
  "api",
  "modules",
  "core",
  "common",
  "shared",
  "utils",
  "components",
  "pages",
  "views",
  "features",
  "domain",
  "infra",
  "infrastructure",
]);

export function hash6(s: string): string {
  return createHash("sha1").update(s, "utf8").digest("hex").slice(0, 6);
}

export function slug(t: string): string {
  let s = t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > CONFIG.TITLE_MAX_CHARS) {
    s = s.slice(0, CONFIG.TITLE_MAX_CHARS).replace(/-+$/, "");
  }
  return s || "node";
}

// Mục 13 ý 8: chỉ chữ, số, khoảng trắng và / & : - ( ) #, tối đa TITLE_MAX_TOKENS token.
export function sanitizeTitle(title: string): string {
  let s = title
    .replace(/[^\p{L}\p{N}\s/&:\-()#]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, CONFIG.TITLE_MAX_TOKENS)
    .join(" ");
  if (s.length > CONFIG.TITLE_MAX_CHARS) {
    s = s.slice(0, CONFIG.TITLE_MAX_CHARS).trim();
  }
  return s;
}

export function toSingular(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length <= CONFIG.TITLE_MIN_TOKEN_CHARS) {
    return word;
  }
  if (lower.endsWith("ss") || lower.endsWith("us") || lower.endsWith("is")) {
    return word;
  }
  if (lower.endsWith("ies")) {
    return word.slice(0, -3) + "y";
  }
  if (lower.endsWith("sses")) {
    return word.slice(0, -2);
  }
  if (lower.endsWith("s")) {
    return word.slice(0, -1);
  }
  return word;
}

export function toTitleCase(w: string): string {
  if (!w) return "";
  if (/[\s_-]/.test(w)) {
    return w.split(/[\s_-]+/).filter(Boolean).map(toTitleCase).join(" ");
  }
  const upper = w.toUpperCase();
  if (ACRONYMS.has(upper)) {
    return upper;
  }
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

export function splitWords(text: string): string[] {
  // Split on camelCase, PascalCase, underscores, dashes, dots, slashes
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_\-./]+/)
    .filter(Boolean);
}

export function normalizeTokens(text: string): string[] {
  const rawWords = splitWords(text);
  const result: string[] = [];

  for (let w of rawWords) {
    // Strip leading I if followed by uppercase (interface name like IUserService)
    if (w.length > 2 && w.startsWith("I") && w[1] >= "A" && w[1] <= "Z") {
      w = w.slice(1);
    }

    const lower = w.toLowerCase();
    if (TECH_TOKENS.has(lower) || /^v\d+$/.test(lower)) {
      continue;
    }
    if (/^\d+$/.test(lower)) {
      continue;
    }
    if (lower.length < CONFIG.TITLE_MIN_TOKEN_CHARS && !ACRONYMS.has(w.toUpperCase())) {
      continue;
    }

    result.push(toTitleCase(w));
  }

  return result;
}

export function staticRouteSegments(path: string | null): string[] {
  if (!path) {
    return [];
  }
  const rawSegments = path.split("/").filter(Boolean);
  const staticSegments: string[] = [];
  for (const seg of rawSegments) {
    if (/^(:|\{|\<|\[)/.test(seg)) {
      continue;
    }
    const clean = seg.toLowerCase();
    if (
      clean === "api" ||
      /^v\d+$/.test(clean) ||
      !/^[A-Za-z0-9_-]+$/.test(seg) ||
      seg.length > CONFIG.ROUTE_SEGMENT_MAX_CHARS
    ) {
      continue;
    }
    staticSegments.push(seg);
  }
  return staticSegments;
}

function nameFromRoute(
  binding: {
    kind: string;
    method: string | null;
    path: string | null;
    display_name: string;
  }
): { title: string; evidence: string } | null {
  const path = binding.path;
  const method = binding.method ? binding.method.toUpperCase() : "GET";
  const evidence = `${method} ${path ?? ""}`.trim();

  if (binding.kind === "PAGE" || binding.kind === "SCREEN" || binding.kind === "COMMAND") {
    const suffix =
      binding.kind === "PAGE" ? "Page" : binding.kind === "SCREEN" ? "Screen" : "Command";
    const namePart = binding.display_name || "Main";
    return { title: sanitizeTitle(`${toTitleCase(namePart)} ${suffix}`), evidence };
  }

  if (!path) {
    return null;
  }

  const rawSegments = path.split("/").filter(Boolean);
  if (rawSegments.length === 0) {
    return null;
  }

  const lastRaw = rawSegments[rawSegments.length - 1];
  const endsWithParam = /^(:|\{|\<|\[)/.test(lastRaw);

  const staticSegments: string[] = [];
  const hadInterveningParam: boolean[] = [];
  let sawParam = false;

  for (const seg of rawSegments) {
    if (/^(:|\{|\<|\[)/.test(seg)) {
      sawParam = true;
      continue;
    }
    const clean = seg.toLowerCase();
    if (
      clean === "api" ||
      /^v\d+$/.test(clean) ||
      !/^[A-Za-z0-9_-]+$/.test(seg) ||
      seg.length > CONFIG.ROUTE_SEGMENT_MAX_CHARS
    ) {
      continue;
    }
    staticSegments.push(seg);
    hadInterveningParam.push(sawParam);
    sawParam = false;
  }

  const S = staticSegments;
  const S_len = S.length;
  if (S_len === 0) {
    return null;
  }

  const lastLower = S[S_len - 1].toLowerCase();

  // Pattern: S[-1] in ACTION_SEGMENTS
  if (ACTION_SEGMENTS.has(lastLower)) {
    const action = toTitleCase(lastLower);
    if (S_len >= 2) {
      const prev = S[S_len - 2].toLowerCase();
      if (prev === "auth") {
        return { title: sanitizeTitle(action), evidence };
      }
      return {
        title: sanitizeTitle(`${action} ${toTitleCase(toSingular(S[S_len - 2]))}`),
        evidence,
      };
    }
    return { title: sanitizeTitle(action), evidence };
  }

  // DELETE with |S| >= 2: Delete Singular(S[-2]) Singular(S[-1])
  if (method === "DELETE" && S_len >= 2) {
    const prevSingular = toTitleCase(toSingular(S[S_len - 2]));
    const lastSingular = toTitleCase(toSingular(S[S_len - 1]));
    return {
      title: sanitizeTitle(`Delete ${prevSingular} ${lastSingular}`),
      evidence,
    };
  }

  // |S| >= 2
  if (S_len >= 2) {
    const hasParamBetween = hadInterveningParam[S_len - 1];
    const prevSingular = toTitleCase(toSingular(S[S_len - 2]));

    if (hasParamBetween) {
      // Có tham số xen: mẫu 1 đoạn S[-1] + Singular(S[-2])
      if (method === "GET") {
        if (endsWithParam) {
          return {
            title: sanitizeTitle(`Get ${prevSingular} ${toTitleCase(toSingular(S[S_len - 1]))}`),
            evidence,
          };
        }
        return {
          title: sanitizeTitle(`List ${prevSingular} ${toTitleCase(S[S_len - 1])}`),
          evidence,
        };
      }
      if (method === "POST") {
        return {
          title: sanitizeTitle(`Create ${prevSingular} ${toTitleCase(toSingular(S[S_len - 1]))}`),
          evidence,
        };
      }
      if (method === "PUT" || method === "PATCH") {
        return {
          title: sanitizeTitle(`Update ${prevSingular} ${toTitleCase(toSingular(S[S_len - 1]))}`),
          evidence,
        };
      }
    }

    // Hai đoạn cuối liền nhau: Singular(S[-2]) S[-1]
    const lastTitle = toTitleCase(S[S_len - 1]);
    return {
      title: sanitizeTitle(`${prevSingular} ${lastTitle}`),
      evidence,
    };
  }

  // |S| === 1
  const targetSingular = toTitleCase(toSingular(S[0]));
  const targetPlural = toTitleCase(S[0]);

  if (method === "POST") {
    return { title: sanitizeTitle(`Create ${targetSingular}`), evidence };
  }
  if (method === "GET") {
    // `GET /user` trả 1 đối tượng, `List User` khó hiểu.
    const isSingularRoute = toSingular(S[0]).toLowerCase() === S[0].toLowerCase();
    if (endsWithParam || isSingularRoute) {
      return { title: sanitizeTitle(`Get ${targetSingular}`), evidence };
    }
    return { title: sanitizeTitle(`List ${targetPlural}`), evidence };
  }
  if (method === "PUT" || method === "PATCH") {
    return { title: sanitizeTitle(`Update ${targetSingular}`), evidence };
  }
  if (method === "DELETE") {
    return { title: sanitizeTitle(`Delete ${targetSingular}`), evidence };
  }

  return { title: sanitizeTitle(targetTitle(S[0])), evidence };
}

function targetTitle(seg: string): string {
  const words = splitWords(seg);
  return words.map(toTitleCase).join(" ");
}

export function nameCandidate(
  c: Pick<Candidate, "binding" | "entry_symbol" | "trace_steps">,
  _ctx?: EngineContext
): { title: string; title_source: NodeTitleSource; title_evidence: string } {
  void _ctx;
  // Bậc 1: ROUTE
  if (c.binding) {
    const routeName = nameFromRoute(c.binding);
    if (routeName) {
      return {
        title: routeName.title,
        title_source: "ROUTE",
        title_evidence: routeName.evidence,
      };
    }
  }

  // Bậc 2: ENTRY_SYMBOL. Handler ẩn danh `<GET />` không có tên để dùng.
  const hashIdx = c.entry_symbol?.indexOf("#") ?? -1;
  const rawSym = hashIdx !== -1 ? c.entry_symbol?.slice(hashIdx + 1) : c.entry_symbol;
  if (rawSym && !rawSym.startsWith("<")) {
    const evidence = rawSym;

    let className: string | null = null;
    let methodName = rawSym;
    if (rawSym.includes(".")) {
      const parts = rawSym.split(".");
      className = parts[0];
      methodName = parts.slice(1).join(".");
    }

    // Bỏ token đầu post, put, patch (theo token, không cắt giữa từ như `posting`).
    const tokens = normalizeTokens(methodName);
    if (tokens.length > 1 && /^(post|put|patch)$/i.test(tokens[0])) {
      tokens.shift();
    }

    if (
      tokens.length > 0 &&
      !tokens.every((t) => GENERIC_NAMES.has(t.toLowerCase()))
    ) {
      if (tokens.length === 1 && className) {
        const classTokens = normalizeTokens(className);
        if (classTokens.length > 0) {
          const resource = classTokens[0];
          return {
            title: sanitizeTitle(`${resource} ${tokens[0]}`),
            title_source: "ENTRY_SYMBOL",
            title_evidence: evidence,
          };
        }
      }
      return {
        title: sanitizeTitle(tokens.join(" ")),
        title_source: "ENTRY_SYMBOL",
        title_evidence: evidence,
      };
    }
  }

  // Bậc 4: DIRECTORY
  const firstFile = c.trace_steps?.[0]?.file_path;
  if (firstFile) {
    const dirSegments = firstFile.split("/").slice(0, -1).reverse();
    for (const dir of dirSegments) {
      if (!GENERIC_DIRS.has(dir.toLowerCase())) {
        const titleTokens = normalizeTokens(dir);
        if (titleTokens.length > 0) {
          return {
            title: sanitizeTitle(titleTokens.join(" ")),
            title_source: "DIRECTORY",
            title_evidence: dir,
          };
        }
      }
    }
  }

  // Bậc 5: FILE_BASENAME
  if (firstFile) {
    const baseName = firstFile.split("/").pop() ?? "";
    const nameWithoutExt = baseName.replace(/\.[^.]+$/, "");
    const tokens = normalizeTokens(nameWithoutExt);
    if (tokens.length > 0) {
      return {
        title: sanitizeTitle(tokens.join(" ")),
        title_source: "FILE_BASENAME",
        title_evidence: firstFile,
      };
    }
    return {
      title: sanitizeTitle(toTitleCase(nameWithoutExt)),
      title_source: "FILE_BASENAME",
      title_evidence: firstFile,
    };
  }

  return {
    title: "Node",
    title_source: "FILE_BASENAME",
    title_evidence: "",
  };
}

export function dedupeTitles(nodes: HybridArchitecturalNode[]): void {
  const groups = new Map<string, HybridArchitecturalNode[]>();
  for (const node of nodes) {
    const list = groups.get(node.title) ?? [];
    list.push(node);
    groups.set(node.title, list);
  }

  for (const [, group] of groups.entries()) {
    if (group.length <= 1) {
      continue;
    }

    // Step 1: same ROUTE, different methods
    const methodDiffers =
      group.every((n) => n.title_source === "ROUTE") &&
      new Set(group.map((n) => n.title_evidence.split(" ")[1])).size === 1 &&
      new Set(group.map((n) => n.title_evidence.split(" ")[0])).size === group.length;

    if (methodDiffers) {
      for (const n of group) {
        const method = n.title_evidence.split(" ")[0];
        n.title = sanitizeTitle(`${n.title} (${method})`);
      }
      continue;
    }

    // Step 2: Differing directory of files[0]
    const dirMap = new Map<HybridArchitecturalNode, string>();
    for (const n of group) {
      const file = n.files[0] ?? "";
      const segs = file.split("/");
      const dir = segs.length > 1 ? segs[segs.length - 2] : "";
      dirMap.set(n, dir);
    }

    const uniqueDirs = new Set(Array.from(dirMap.values()).filter(Boolean));
    if (uniqueDirs.size === group.length) {
      for (const n of group) {
        const dir = dirMap.get(n);
        n.title = sanitizeTitle(`${n.title} (${dir})`);
      }
      continue;
    }

    // Step 3: Append #2, #3 sorted by id
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (let i = 1; i < group.length; i++) {
      group[i].title = sanitizeTitle(`${group[i].title} #${i + 1}`);
    }
  }
}
