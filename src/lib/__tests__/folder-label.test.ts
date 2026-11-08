import { describe, expect, it } from "vitest";
import { folderLabel, objectWords } from "../folder-label";

describe("folderLabel: tên thư mục con suy từ tên bài AI", () => {
  it("bỏ động từ đầu, lấy phần đầu chung", () => {
    expect(folderLabel(["Tạo giai đoạn", "Cập nhật giai đoạn của dự án"], "Phases")).toBe("Giai đoạn");
    expect(folderLabel(["Xem danh sách bình luận", "Thêm bình luận", "Xóa bình luận"], "Comments")).toBe("Bình luận");
    expect(folderLabel(["Thêm artifact vào dự án", "Xóa artifact khỏi dự án"], "Artifacts")).toBe("Artifact dự án");
    expect(folderLabel(["Tạo mã truy cập khách", "Thu hồi mã khách"], "Guest token")).toBe("Mã khách");
    expect(folderLabel(["Thêm tài liệu dự án", "Xem tài liệu dự án", "Xóa tài liệu dự án"], "Artifacts")).toBe("Tài liệu dự án");
    expect(folderLabel(["Tạo giai đoạn dự án", "Nối các giai đoạn", "Cập nhật giai đoạn"], "Phases")).toBe("Giai đoạn");
    expect(folderLabel(["Thích bài viết", "Bỏ thích bài viết"], "Favorite")).toBe("Bài viết");
  });

  it("bỏ từ đệm sau động từ và dấu ~ / …", () => {
    expect(objectWords("~Xem chi tiết các giai đoạn…")).toEqual(["giai", "đoạn"]);
    expect(folderLabel(["Tạo mới token khách", "Xóa token khách"], "Guest tokens")).toBe("Token khách");
  });

  it("không có phần chung, thiếu tên AI hoặc chỉ 1 bài ⇒ giữ tên route", () => {
    expect(folderLabel(["Tạo giai đoạn", "Nối các phase"], "Phases")).toBe("Phases");
    expect(folderLabel(["Tạo giai đoạn", null], "Phases")).toBe("Phases");
    expect(folderLabel(["Tạo giai đoạn"], "Phases")).toBe("Phases");
    expect(folderLabel([], "Phases")).toBe("Phases");
  });

  it("chỉ chung 1 từ mà tên dài hơn ⇒ quá chung chung, giữ tên route", () => {
    expect(folderLabel(["Tạo mã truy cập", "Xóa mã khách"], "Codes")).toBe("Codes");
  });

  it("phần chung quá dài (> 4 từ) ⇒ giữ tên route", () => {
    expect(folderLabel(["Tạo a b c d e", "Xóa a b c d e"], "Things")).toBe("Things");
  });
});
