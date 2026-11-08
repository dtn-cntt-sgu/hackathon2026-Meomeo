import { describe, expect, it } from "vitest";
import type { HybridArchitecturalNode } from "@/contracts";
import { dedupeTitles, hash6, nameCandidate, slug, sanitizeTitle } from "./naming";
import type { Candidate } from "./types";

describe("naming (ENG-111, ENG-112, Spec 11 §13)", () => {
  it("T-ENG-18: hash6 va slug cho slice-order-checkout-a6ff3b", () => {
    const entrySymbol = "src/routes/order.routes.ts#<POST /checkout>";
    const h = hash6(entrySymbol);
    expect(h).toBe("a6ff3b");

    const baseTitle = "Order Checkout";
    const s = slug(baseTitle);
    expect(s).toBe("order-checkout");

    const id = `slice-${s}-${h}`;
    expect(id).toBe("slice-order-checkout-a6ff3b");
  });

  it("T-ENG-22: cac mau route co ban", () => {
    const cases = [
      { method: "POST", path: "/orders/checkout", expected: "Order Checkout" },
      { method: "GET", path: "/users/:id/orders", expected: "List User Orders" },
      { method: "POST", path: "/orders", expected: "Create Order" },
      { method: "GET", path: "/orders/:id", expected: "Get Order" },
      { method: "GET", path: "/orders", expected: "List Orders" },
      { method: "DELETE", path: "/orders/:id", expected: "Delete Order" },
    ];

    for (const c of cases) {
      const candidate: Pick<Candidate, "binding" | "entry_symbol" | "trace_steps"> = {
        binding: {
          file_path: "src/routes.ts",
          line_start: 1,
          line_end: 10,
          kind: "HTTP",
          method: c.method,
          path: c.path,
          handler: "handler",
          middlewares: [],
          display_name: `${c.method} ${c.path}`,
        },
        entry_symbol: null,
        trace_steps: [],
      };
      const result = nameCandidate(candidate);
      expect(result.title).toBe(c.expected);
      expect(result.title_source).toBe("ROUTE");
    }
  });

  it("T-ENG-22b: cac mau route nang cao", () => {
    const cases = [
      { method: "POST", path: "/orders/:id/cancel", expected: "Cancel Order" },
      { method: "POST", path: "/auth/login", expected: "Login" },
      { method: "GET", path: "/health", expected: "Health" },
      {
        method: "DELETE",
        path: "/articles/:slug/comments/:id",
        expected: "Delete Article Comment",
      },
    ];

    for (const c of cases) {
      const candidate: Pick<Candidate, "binding" | "entry_symbol" | "trace_steps"> = {
        binding: {
          file_path: "src/routes.ts",
          line_start: 1,
          line_end: 10,
          kind: "HTTP",
          method: c.method,
          path: c.path,
          handler: "handler",
          middlewares: [],
          display_name: `${c.method} ${c.path}`,
        },
        entry_symbol: null,
        trace_steps: [],
      };
      const result = nameCandidate(candidate);
      expect(result.title).toBe(c.expected);
      expect(result.title_source).toBe("ROUTE");
    }
  });

  it("Checkout (cart), Checkout (payment) ma id khong doi", () => {
    const node1: HybridArchitecturalNode = {
      id: "slice-checkout-111111",
      title: "Checkout",
      title_source: "FILE_BASENAME",
      title_evidence: "src/cart/checkout.ts",
      node_type: "ARCHITECTURAL_DATA_FLOW",
      entry_symbol: "src/cart/checkout.ts#checkout",
      prerequisites: [],
      position: { x: 0, y: 0 },
      files: ["src/cart/checkout.ts"],
      languages: ["TYPESCRIPT"],
      support_tier: "RESOLVED",
      cognitive_complexity: 5,
      rank_score: 1,
      is_vip_algorithm: false,
      is_capstone: false,
      uncle_bob: null,
      trace_steps: [],
      dto_snippet: "",
      group_id: "",
      entities: [],
    };

    const node2: HybridArchitecturalNode = {
      id: "slice-checkout-222222",
      title: "Checkout",
      title_source: "FILE_BASENAME",
      title_evidence: "src/payment/checkout.ts",
      node_type: "ARCHITECTURAL_DATA_FLOW",
      entry_symbol: "src/payment/checkout.ts#checkout",
      prerequisites: [],
      position: { x: 0, y: 0 },
      files: ["src/payment/checkout.ts"],
      languages: ["TYPESCRIPT"],
      support_tier: "RESOLVED",
      cognitive_complexity: 6,
      rank_score: 1,
      is_vip_algorithm: false,
      is_capstone: false,
      uncle_bob: null,
      trace_steps: [],
      dto_snippet: "",
      group_id: "",
      entities: [],
    };

    const nodes = [node1, node2];
    dedupeTitles(nodes);

    expect(node1.title).toBe("Checkout (cart)");
    expect(node1.id).toBe("slice-checkout-111111");

    expect(node2.title).toBe("Checkout (payment)");
    expect(node2.id).toBe("slice-checkout-222222");
  });

  it("slug tieng Viet co đ", () => {
    expect(slug("Đơn hàng mới")).toBe("don-hang-moi");
    expect(slug("đăng ký")).toBe("dang-ky");
    expect(slug("Đường đi ngắn nhất")).toBe("duong-di-ngan-nhat");
  });

  it("đoạn route có dấu gạch tách thành từ, PUT có tham số xen, tiền tố post theo token", () => {
    const http = (method: string, path: string) => ({
      binding: {
        file_path: "src/a.ts",
        line_start: 1,
        line_end: 1,
        kind: "HTTP" as const,
        method,
        path,
        handler: "src/a.ts#h",
        middlewares: [],
        display_name: "",
      },
      entry_symbol: "src/a.ts#h",
      trace_steps: [],
    });
    expect(nameCandidate(http("GET", "/user-profiles")).title).toBe("List User Profiles");
    expect(nameCandidate(http("PUT", "/articles/:slug/comments/:id")).title).toBe("Update Article Comment");

    const named = (key: string) => ({ binding: null, entry_symbol: key, trace_steps: [] });
    expect(nameCandidate(named("src/a.ts#postOrder")).title).toBe("Order");
    expect(nameCandidate(named("src/a.ts#postingQueue")).title).toBe("Posting Queue");
  });

  it("sanitizeTitle giới hạn token và ký tự", () => {
    expect(sanitizeTitle("One Two Three Four Five")).toBe("One Two Three Four");
    expect(sanitizeTitle("Order*Item!")).toBe("OrderItem");
  });
});
