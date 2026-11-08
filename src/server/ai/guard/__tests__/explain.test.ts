import { describe, expect, it } from "vitest";
import type { ExplainSelectionRaw, GuardIssue } from "@/contracts";
import { checkExplain, invalidLineRefs } from "../explain";
import { explainScope } from "../names";
import shopApiJson from "@/server/engine/__fixtures__/shop-api.json";
import type { StaticEngineResult } from "@/contracts";

const graph = shopApiJson as unknown as StaticEngineResult;
const profileNode = graph.nodes.find((n) => n.id === "slice-profile")!;

describe("GUARD-23 checkExplain", () => {
  const scope = explainScope(profileNode, 2, ["getProfile"], graph);
  const forbidden = ["redis", "mongodb", "aws"];

  it("GUARD-23 `here` có `verifyToken` không có trong bước ⇒ E2, null", () => {
    const raw: ExplainSelectionRaw = {
      kind: "NAME",
      what: "Đây là tên hàm.",
      here: "Đoạn này gọi hàm `verifyToken` để kiểm tra quyền người dùng.",
      analogy: "Giống như người bảo vệ soát vé.",
      skill: "AUTH_SECURITY",
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).toBeNull();
    expect(issues.some((i) => i.code === "E2" && i.name === "verifyToken")).toBe(
      true,
    );
  });

  it("GUARD-23 `skill = 'FOO'` ⇒ skill = null, giữ phần còn lại", () => {
    const raw: ExplainSelectionRaw = {
      kind: "NAME",
      what: "Đây là hàm `authMiddleware` xử lý xác thực.",
      here: "Đoạn này dùng `jwt` để xác thực token.",
      analogy: "Người gác cổng.",
      skill: "FOO" as unknown as ExplainSelectionRaw["skill"],
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).not.toBeNull();
    expect(result?.skill).toBeNull();
    expect(result?.kind).toBe("NAME");
    expect(result?.what).toBe(raw.what);
    expect(result?.here).toBe(raw.here);
    expect(issues.length).toBe(0);
  });

  it("GUARD-23 `what` 5 câu ⇒ còn 3 câu", () => {
    const raw: ExplainSelectionRaw = {
      kind: "CODE",
      what: "Câu thứ nhất nói về biến. Câu thứ hai nói về hàm! Câu thứ ba nói về middleware? Câu thứ tư giải thích thêm. Câu thứ năm kết luận.",
      here: "Nó xác thực token của request.",
      analogy: "",
      skill: "AUTH_SECURITY",
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).not.toBeNull();
    expect(result?.what).toBe(
      "Câu thứ nhất nói về biến. Câu thứ hai nói về hàm! Câu thứ ba nói về middleware?",
    );
    expect(issues.length).toBe(0);
  });

  it("GUARD-23 `what` rỗng ⇒ E1, null", () => {
    const raw: ExplainSelectionRaw = {
      kind: "KEYWORD",
      what: "   ",
      here: "Nó dùng trong vòng lặp.",
      analogy: "",
      skill: null,
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).toBeNull();
    expect(issues.some((i) => i.code === "E1")).toBe(true);
  });

  it("GUARD-23 `here` rỗng ⇒ E1, null", () => {
    const raw: ExplainSelectionRaw = {
      kind: "KEYWORD",
      what: "Từ khóa async.",
      here: "",
      analogy: "",
      skill: null,
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).toBeNull();
    expect(issues.some((i) => i.code === "E1")).toBe(true);
  });

  it("GUARD-23 `kind` không hợp lệ ⇒ E1, null", () => {
    const raw: ExplainSelectionRaw = {
      kind: "INVALID_KIND" as unknown as ExplainSelectionRaw["kind"],
      what: "Giải thích gì đó.",
      here: "Ở đây làm gì đó.",
      analogy: "",
      skill: null,
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).toBeNull();
    expect(issues.some((i) => i.code === "E1")).toBe(true);
  });

  it("GUARD-23 từ cấm trong lời giải thích ⇒ E3, null", () => {
    const raw: ExplainSelectionRaw = {
      kind: "NAME",
      what: "Đoạn code kết nối với Redis để lấy dữ liệu.",
      here: "Lấy token từ header.",
      analogy: "",
      skill: null,
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).toBeNull();
    expect(issues.some((i) => i.code === "E3")).toBe(true);
  });

  it("GUARD-23 có số dòng trong text ⇒ E4, null", () => {
    const raw: ExplainSelectionRaw = {
      kind: "NAME",
      what: "Xem hàm này ở dòng 15.",
      here: "Lấy token từ header.",
      analogy: "",
      skill: null,
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).toBeNull();
    expect(issues.some((i) => i.code === "E4")).toBe(true);
  });

  it("GUARD-23 hợp lệ qua cổng gác đầy đủ", () => {
    const raw: ExplainSelectionRaw = {
      kind: "NAME",
      what: "Biến `JWT_SECRET` chứa khóa ký token bí mật.",
      here: "Dùng để kiểm tra tính hợp lệ của token trong middleware này.",
      analogy: "Chiếc chìa khóa vạn năng của bảo vệ.",
      skill: "AUTH_SECURITY",
    };
    const issues: GuardIssue[] = [];
    const result = checkExplain(raw, scope, forbidden, issues);

    expect(result).not.toBeNull();
    expect(result?.kind).toBe("NAME");
    expect(result?.skill).toBe("AUTH_SECURITY");
    expect(issues.length).toBe(0);
  });
});

describe("invalidLineRefs unit test", () => {
  it("nhận diện số dòng đơn hoặc khoảng dòng", () => {
    const allowed = new Set([10, 11, 12]);
    expect(invalidLineRefs("Xem ở dòng 10", allowed)).toEqual([]);
    expect(invalidLineRefs("Xem ở dòng 10–12", allowed)).toEqual([]);
    expect(invalidLineRefs("Xem ở dòng 99", allowed)).toEqual(["dòng 99"]);
    expect(invalidLineRefs("Xem ở line 5-20", allowed)).toEqual(["line 5-20"]);
  });
});
