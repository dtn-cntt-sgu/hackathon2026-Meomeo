# 08 — Phần AI của SimpliFey (vai C): báo cáo và giải thích

> Bản dễ hiểu, cập nhật 06/11/2026 sau khi C-01 → C-12 và C-04 (`Q9`) đã lên `main`. Nguồn chuẩn vẫn là `spec/20`, `spec/21`, `spec/22`. Chỗ nào khác spec thì spec đúng. Mọi con số token ghi "đo" là số đo thật ngày 06/11 trên repo `shop-api` (fixture) và BrewLite (`apps/api`); số ghi "ước" là ước lượng trong `spec/02`.

## Đọc nhanh

- Engine dựng bản đồ bài học bằng code, **0 token**. AI chỉ làm 5 việc mà code không làm được: **viết lời giải thích, đặt câu hỏi, chấm câu trả lời**.
- Có **5 lời gọi Gemini** (`gemini-3.5-flash-lite`). Mỗi lời gọi là 1 request, lỗi thì thử lại tối đa 1 lần.
- Mọi chữ AI viết đều **đi qua cổng gác** trước khi lên giao diện. Cổng gác chặn tên bịa, công nghệ không có trong repo, số dòng sai. Nó **không** bảo đảm nghĩa đúng 100%.
- Ba lời gọi kết quả dùng chung cho mọi người học được **cache**: tổng quan, phân tích bài, giải thích đoạn chọn. Hai lời gọi gắn với từng người học **không cache**: đặt câu hỏi, chấm.
- Điểm kỹ năng của người học (BKT, 16 kỹ năng) do **server tính bằng công thức**, không do AI. AI chỉ cho biết câu trả lời trúng ý nào.

| # | Lời gọi | Khi nào chạy | Cache | Lên giao diện ở đâu | Token / lần |
| :-: | :-- | :-- | :-- | :-- | :-- |
| 1 | `analyze-overview` | Ngay sau khi quét repo, 1 lần / phiên | Có, dùng chung | Bức tranh chung, tên nhóm, tên bài | Đo: 1 051–1 900 vào, 238–635 ra |
| 2 | `analyze-node` | Bài đang mở + 1–2 bài kế tiếp | Có, dùng chung | Thẻ vai trò, tour từng bước, điểm hay/dở | Đo: 2 000–3 200 vào, 309–830 ra |
| 3 | `enrich-node` | Khi bắt đầu học 1 bài | Không | Câu hỏi Feynman | Đo: 2 200–2 800 vào, 580–880 ra |
| 4 | `evaluate-feynman` | Mỗi lần nộp câu trả lời | Không | Kết quả, nhận xét, gợi ý | Ước: ~800 vào, ~200 ra |
| 5 | `explain-selection` | Khi người học bôi đen code rồi bấm nút | Có, dùng chung | Ô giải thích cạnh đoạn chọn | Đo: ~1 300 vào, 125–139 ra |

---

## 1. Sơ đồ tổng: một phiên học đi qua 5 lời gọi

```mermaid
flowchart TD
    U(["Người học dán link repo"]) --> E["Engine quét repo<br/>bản đồ ≤ 20 bài, 0 token"]
    E --> OV["① analyze-overview<br/>bức tranh chung + tên nhóm, tên bài"]
    E --> AN["② analyze-node (tải trước)<br/>bài đang mở + 1–2 bài kế"]
    OV --> UI1["Màn tổng quan<br/>nhóm chức năng, tên bài tiếng Việt"]
    AN --> UI2["Vào bài: thẻ vai trò ⇒ tour từng bước ⇒ điểm hay / dở"]
    UI2 --> PLAN["Server lập kế hoạch câu hỏi từ BKT<br/>câu 1 luôn là FLOW (0 token)"]
    PLAN --> EN["③ enrich-node<br/>đặt câu hỏi + đáp án mẫu + ý bắt buộc"]
    EN --> UI3["Tab Feynman: câu hỏi"]
    UI3 --> ANS(["Người học trả lời bằng lời của mình"])
    ANS --> GR["④ evaluate-feynman<br/>chấm, nhận xét, gợi ý theo bậc"]
    GR --> BKT["Server cập nhật điểm kỹ năng (BKT)<br/>đổi màu bài, mở bài sau"]
    GR -- "chưa đạt, còn lượt" --> UI3
    BKT --> UI2
    UI2 -. "bôi đen code bất kỳ lúc nào" .-> EX["⑤ explain-selection<br/>giải thích đoạn chọn"]
    EX -.-> UI2
```

Cách đọc: ① và ② chạy gần như song song ngay khi quét xong (D-83, D-46). Tổng quan được gọi **trước**, không chờ bài nào được phân tích. ③ và ④ chỉ chạy khi người học thật sự học. ⑤ chạy theo yêu cầu.

### Dòng thời gian một phiên

```mermaid
sequenceDiagram
    participant H as Người học
    participant UI as Giao diện
    participant S as Server
    participant G as Gemini
    H->>UI: Dán link repo
    UI->>S: POST /api/ingest
    S-->>UI: Bản đồ bài học (engine, 0 token)
    UI->>S: POST /api/analyze-overview
    S->>G: ① gói ngữ cảnh (không có code)
    G-->>S: summary, groups, node_titles
    S-->>UI: Bức tranh chung (đã qua cổng gác)
    UI->>S: POST /api/analyze-node (bài 1, bài 2)
    S->>G: ② code của bài
    G-->>S: kỹ năng, tóm tắt, bước, điểm hay/dở
    H->>UI: Mở bài, đọc tour
    H->>UI: Bôi đen "await", bấm Giải thích
    UI->>S: POST /api/explain-selection
    S->>G: ⑤ code của 1 bước + đoạn chọn
    G-->>UI: kind, what, here, analogy
    H->>UI: Bấm Học
    UI->>S: POST /api/enrich-node
    S->>G: ③ kế hoạch câu hỏi + code các bước liên quan
    G-->>UI: Câu hỏi (đáp án mẫu giữ ở server)
    H->>UI: Trả lời
    UI->>S: POST /api/evaluate
    S->>G: ④ câu hỏi + ý bắt buộc + câu trả lời (không có code)
    G-->>S: điểm, ý trúng kèm trích dẫn, gợi ý
    S-->>UI: Đạt / chưa đạt, nhận xét, gợi ý, điểm kỹ năng mới
```

---

## 2. Khung chung của mọi lời gọi

Cả 5 lời gọi đi qua cùng một khung trong `src/server/ai/gemini.ts`, `guard/*`, `cache`.

```mermaid
flowchart LR
    A["Dựng prompt<br/>dữ liệu bọc trong thẻ, che secret"] --> Q{"Còn quota<br/>token của phiên?"}
    Q -- "hết" --> X1["ERR_TOKEN_QUOTA_EXCEEDED"]
    Q -- "còn" --> C{"Trúng cache?"}
    C -- "có" --> OUT["Trả kết quả, 0 token"]
    C -- "không" --> G["Gọi Gemini<br/>JSON theo schema"]
    G --> P{"JSON đúng<br/>kiểu?"}
    P -- "sai / 503 / 429" --> R["Thử lại 1 lần<br/>chờ theo retryDelay của Google"]
    P -- "đúng" --> GU{"Cổng gác"}
    GU -- "trượt" --> RF["Gọi lại kèm lý do<br/>chỉ mã lỗi + tên, không chép chữ AI"]
    GU -- "qua" --> W["Ghi cache nếu được cache<br/>ghi ai_usage, cộng token"] --> OUT
```

Những điểm chung quan trọng:

- **Dữ liệu là dữ liệu, không phải lệnh.** Code, README, câu trả lời của người học đều bọc trong thẻ như `<code_data>`, `<student_answer>`. Chuỗi giả lệnh trong đó bị vô hiệu. File có chú thích giống câu lệnh gửi cho AI thì kèm `<warning>`.
- **Cổng gác** (`spec/21`) chặn:
  - tên hàm, biến, file không có trong code (`checkNames`);
  - công nghệ không có trong repo, ví dụ nói "Redis" khi repo không dùng (`findForbidden`);
  - số dòng nằm ngoài bước;
  - thiếu trường, sai số lượng.

  Mỗi lời gọi trượt cổng gác thì xử lý khác nhau, xem từng mục bên dưới.
- **Cache theo `PROMPT_VERSION`** (hiện là `1.2.0`). Đổi prompt thì đổi số, bản cũ không bị dùng lại.
- **Quota** là 200 000 token mỗi phiên, đếm ở server từ số token thật Google trả về.

---

## 3. ① `analyze-overview` — bức tranh chung

**Mục đích:** người mới vào repo lạ cần biết hệ thống làm gì, chia mấy nhóm việc, mỗi bài là việc gì, **trước khi** đọc code.

```mermaid
flowchart LR
    G["Kết quả engine"] --> P["Gói ngữ cảnh<br/>tên repo, framework, README đầu,<br/>đường chính, nhóm, mỗi bài:<br/>điểm vào, tầng, chuỗi hàm, dữ liệu"]
    P --> AI["Gemini"]
    AI --> GU["Cổng gác GUARD-11<br/>đủ mọi nhóm, mọi bài, không trùng tên,<br/>tên nhóm ≤ 4 từ, tên bài 2–6 từ"]
    GU -- "qua" --> C[("ai_cache<br/>REPO_OVERVIEW")]
    GU -- "trượt 2 lần" --> N["ai = null<br/>giao diện dùng tên engine + câu dựng sẵn"]
```

**Input (rút gọn, không có code):**

```text
repo: shop-api · loai_du_an: WEB_BACKEND · framework: Express
readme: # Shop API REST API cho cửa hàng: đăng ký, giỏ hàng, thanh toán…
duong_chinh: slice-register → slice-profile → slice-cart → slice-order-checkout
NHOM group-entity-order · ENTITY · Order
  bai: slice-cart, slice-order-checkout, slice-send-email
NODE slice-product-list · "List Products" · nhom group-entity-product
  vao: GET /products
  ham: router.get('/products') → ProductService.listProducts → CategoryRepo.findById
  du_lieu: Product[READ], Category[READ]
```

**Output (đo thật, `shop-api` có nhóm giả):**

```json
{
  "summary": "Hệ thống cung cấp giao diện lập trình ứng dụng cho cửa hàng trực tuyến phục vụ người dùng và quản trị viên. Người dùng lần lượt thực hiện các bước đăng ký, xem hồ sơ, quản lý giỏ hàng, thanh toán đơn hàng và xem báo cáo doanh thu.",
  "groups": [{ "group_id": "group-entity-user", "name": "Tài khoản" }, { "group_id": "group-entity-order", "name": "Đơn hàng" }],
  "node_titles": [{ "node_id": "slice-product-list", "title": "Xem danh sách sản phẩm" }, { "node_id": "slice-cart", "title": "Quản lý giỏ hàng" }]
}
```

**Lên giao diện:** màn tổng quan hiện `summary`, các chip nhóm chức năng, và **tên bài tiếng Việt** thay cho tên engine ("List Products" ⇒ "Xem danh sách sản phẩm") ở mọi chỗ hiện tên bài (`displayTitle`). Tên AI chỉ để hiện; `node.id` không đổi.

**Đóng góp:** biến bản đồ kỹ thuật thành bản đồ nghiệp vụ người mới đọc được. Đo trên BrewLite: 13/13 bài có tên, không trùng, 1 request.

---

## 4. ② `analyze-node` — giải thích một bài

**Mục đích:** đọc code của 1 bài (1 luồng đi qua nhiều file), nói bài giúp người dùng làm gì, giải thích từng bước cho người mới, chỉ ra điểm hay và điểm dở **có thật trong code**.

```mermaid
flowchart LR
    N["Code các bước của bài<br/>+ kiểu dữ liệu (DTO)"] --> AI["Gemini"]
    AI --> GU["Cổng gác GUARD-10<br/>kỹ năng có bằng chứng ở đúng bước,<br/>điểm dở có ký hiệu thật, mỗi bước 1 câu"]
    GU -- "qua" --> C[("ai_cache<br/>NODE_ANALYSIS, dùng chung")]
    GU -- "trượt 2 lần" --> SK["skeleton_only<br/>chỉ giữ kỹ năng + khung bước"]
```

**Input:** code đã che secret, có số dòng gốc, ví dụ bước 2 của bài "Danh sách sản phẩm":

```text
### Bước 2 · BUSINESS_LOGIC · src/services/product.service.ts · ProductService.listProducts
  15 |   const products = await productRepo.findAll();
  16 |   for (const p of products) {
  17 |     p.category = await categoryRepo.findById(p.categoryId);
```

**Output (rút gọn):**

```json
{
  "weak_points": [{ "skill": "DB_OPTIMIZATION", "step": 2, "symbol": "findById",
    "what": "Vòng `for` gọi `categoryRepo.findById` cho từng sản phẩm.",
    "consequence": "Càng nhiều sản phẩm, database bị hỏi càng nhiều lần, trang càng chậm." }],
  "skills": [{ "skill": "DB_OPTIMIZATION", "step": 2, "symbol": "findById", "reason": "…" }],
  "architecture": { "patterns": ["LAYERED"], "summary": "Luồng này giúp người dùng xem danh sách sản phẩm… Các bước chia việc …" },
  "steps": [{ "step": 1, "text": "Đường dẫn (route) nhận yêu cầu …" }],
  "strengths": []
}
```

`weak_points` đứng **trước** `skills` trong schema. Viết điểm dở trước giúp AI không bỏ quên kỹ năng của điểm dở (lỗi C-06, C-09 đã sửa).

**Lên giao diện:**

| Phần output | Hiện ở |
| :-- | :-- |
| Câu 1 của `summary` ("giúp người dùng …") | Dòng "Vai trò" của **thẻ vai trò** khi vào bài |
| `steps[].text` | **Tour từng bước**: mỗi lần 1 bước, tô đúng đoạn code của bước đó |
| `strengths`, `weak_points` | Phần **điểm hay / điểm dở**, tô đúng dòng (điểm dở bước 2 ⇒ dòng 14–20), nhãn "Nhận định của AI" |
| `skills` | Chip kỹ năng; là đầu vào để server lập kế hoạch câu hỏi |

**Đóng góp:** đây là lời gọi tạo nội dung học chính. Kết quả cache dùng chung nên người thứ hai mở cùng repo không tốn token. Đo 13 bài BrewLite: 12 bài đủ, 1 bài `skeleton_only` vì cổng gác chặn. Sau khi nâng trần lên 1400 token (C-02), không bài nào bị cắt giữa chừng.

---

## 5. ③ `enrich-node` — đặt câu hỏi Feynman

**Mục đích:** hỏi đúng chỗ người học còn yếu, ở đúng độ khó, bắt người học **giải thích bằng lời** thay vì chọn đáp án.

```mermaid
flowchart LR
    B["Điểm kỹ năng BKT<br/>của người học"] --> PL["Server lập kế hoạch (0 token)<br/>kỹ năng × bậc × góc hỏi<br/>câu 1 luôn là FLOW"]
    A["Bản phân tích ②"] --> PL
    PL --> AI["Gemini<br/>+ code các bước liên quan<br/>+ ý người học từng hụt"]
    AI --> GU["Cổng gác GUARD-12 (Q1–Q9)<br/>đúng kỹ năng, tên thật,<br/>đáp án đủ bước, không hỏi chung"]
    GU -- "câu trượt" --> R["Gọi lại riêng câu đó"] --> GU
    GU -- "vẫn trượt" --> D["Bỏ câu (DROPPED), không tính điểm"]
    GU -- "qua" --> RUN[("node_runs<br/>không cache, gắn người học")]
```

**Input:** kế hoạch do server lập, ví dụ người mới học bài "Danh sách sản phẩm":

```text
câu 1: LAYERED_SEPARATION · NOVICE · FLOW · bước [1,2,3]   (BKT-50: câu 1 luôn là FLOW)
câu 2: DB_OPTIMIZATION · NOVICE · WEAKNESS · bước [2]
<learner_history> - [DB_OPTIMIZATION] Mỗi sản phẩm tốn thêm 1 truy vấn   (ý người này từng hụt)
```

**Output (câu 2):**

```json
{
  "skill": "DB_OPTIMIZATION",
  "feynman_question": "Trang danh sách có 200 sản phẩm. Vì sao càng nhiều sản phẩm thì trang càng chậm?",
  "reference_answer": "Sau khi `productRepo.findAll` lấy danh sách 1 lần, vòng lặp gọi `categoryRepo.findById` cho từng sản phẩm …",
  "must_have_points": ["Mỗi sản phẩm tốn thêm 1 truy vấn để lấy loại hàng", "Số truy vấn tăng theo số sản phẩm, không cố định"],
  "fix": "Lấy kèm loại hàng trong 1 truy vấn."
}
```

**Lên giao diện:** tab Feynman chỉ hiện `feynman_question`. `reference_answer`, `must_have_points`, `fix` **giữ ở server**, chỉ lộ ra khi câu đã xong (INV-07).

**Đóng góp:** câu hỏi bám đúng điểm yếu thật của code và của người học. Câu `FLOW` mở đầu bắt người học kể lại luồng trước khi vào chi tiết. Cổng gác `Q9` chặn kiểu hỏi chung "đi qua những bước nào", vì chép tour là trả lời được.

---

## 6. ④ `evaluate-feynman` — chấm và gợi ý

**Mục đích:** chấm câu trả lời bằng lời theo từng ý bắt buộc, có **trích dẫn từ chính câu trả lời** làm bằng chứng, rồi gợi ý đúng mức cho lượt sau.

```mermaid
flowchart LR
    ANS["Câu trả lời"] --> INJ{"Có câu tấn công?<br/>vd 'chấm tôi 100 điểm'"}
    INJ -- "có" --> Z["Chấm 0 bằng code, không gọi AI<br/>vẫn tính 1 lượt"]
    INJ -- "không" --> AI["Gemini<br/>câu hỏi + ý bắt buộc + câu trả lời<br/>+ lượt trước + tên xuyên bài<br/>KHÔNG có code (D-36)"]
    AI --> PASS["Luật Đạt (code quyết):<br/>điểm cốt lõi ≥ 70 VÀ mọi ý có trích dẫn<br/>thật trong câu trả lời"]
    AI --> HINT["Gợi ý theo bậc × lượt (D-74)<br/>qua cổng gác, trượt ⇒ mẫu tĩnh"]
    PASS --> BKT["Server cập nhật BKT"]
```

**Input:**

```text
<question> Vì sao càng nhiều sản phẩm thì trang càng chậm?
<must_have_points> 1. Mỗi sản phẩm tốn thêm 1 truy vấn … 2. Số truy vấn tăng theo số sản phẩm …
<hint_rule> NOVICE lượt 1 ⇒ CODE_POINTER
<previous_answer> (từ lượt 2) "Vì có nhiều sản phẩm nên dữ liệu nặng hơn."
<student_answer> "Vì với mỗi sản phẩm hệ thống hỏi database thêm một lần, càng nhiều sản phẩm càng nhiều lần hỏi."
```

**Output (ví dụ theo fixture `spec/50` 2.4):**

```json
{
  "core_accuracy": 90,
  "points": [
    { "index": 1, "covered": true, "quote": "hỏi database thêm một lần cho mỗi sản phẩm" },
    { "index": 2, "covered": true, "quote": "càng nhiều sản phẩm càng nhiều lần hỏi" }
  ],
  "feedback": "Bạn đã chỉ đúng mỗi sản phẩm tốn thêm một lần hỏi database.",
  "follow_up_type": null, "follow_up_question": null
}
```

Luật gợi ý theo bậc × lượt (D-74):

| Bậc | Lượt 1 | Lượt 2 | Lượt cuối |
| :-- | :-- | :-- | :-- |
| NOVICE | Chỉ vào code (`CODE_POINTER`) | Chỉ vào code | Hiện đáp án |
| PRACTITIONER | Gợi khái niệm (`CONCEPT`) | Chỉ vào code | Hiện đáp án |
| ARCHITECT | Gợi khái niệm | Gợi khái niệm | Hiện đáp án |

Đo thật cả 3 bậc × 2 lượt: 6/6 gợi ý đúng bảng, cả 6 do AI viết và qua cổng gác.

**Lên giao diện:** Đạt / chưa đạt, ý nào đã trúng, `feedback` (tối đa vài câu), gợi ý trỏ về đúng bước của tour. Điểm kỹ năng đổi ngay sau câu. `misconception` (AI đoán người học hiểu sai chỗ nào) **không bao giờ gửi ra trình duyệt**.

**Đóng góp:** chấm có bằng chứng. AI không thể tự cho Đạt, vì code kiểm lại từng trích dẫn có thật trong câu trả lời. Nhờ vậy điểm BKT đáng tin.

---

## 7. ⑤ `explain-selection` — giải thích đoạn bôi đen

**Mục đích:** đang đọc code gặp chữ lạ (`await`, `findById`, một vòng `for`…) thì bôi đen, bấm nút, đọc giải thích ngay tại chỗ, không phải rời bài.

```mermaid
flowchart LR
    S["Bôi đen ≤ 300 ký tự<br/>trong 1 bước"] --> V{"Route cắt lại từ snapshot<br/>khớp đúng?"}
    V -- "không" --> E1["ERR_SELECTION_INVALID, 0 token"]
    V -- "có" --> REF["Tìm tên xuyên bài (code, 0 token)"]
    REF --> C{"Trúng cache?"}
    C -- "có" --> OUT["Trả ngay, 0 token"]
    C -- "không" --> L{"Đã gọi AI<br/>30 lần trong phiên?"}
    L -- "rồi" --> E2["ERR_EXPLAIN_LIMIT"]
    L -- "chưa" --> AI["Gemini<br/>chỉ code của bước đó + tên bước trước, sau"]
    AI --> GU{"Cổng gác GUARD-23"}
    GU -- "qua" --> OUT
    GU -- "trượt" --> NUL["explanation = null<br/>không gọi lại, không cache"]
```

**Input:** `await` ở dòng 17, cột 18–23 của bước 2 bài "Danh sách sản phẩm".

**Output (đo thật):**

```json
{
  "kind": "KEYWORD",
  "what": "Từ khóa `await` dùng trong hàm bất đồng bộ để tạm dừng việc chạy cho đến khi một lời hứa hoàn thành và trả về kết quả.",
  "here": "Nó dùng để đợi kết quả từ `categoryRepo.findById` trước khi gán danh mục cho từng sản phẩm.",
  "analogy": "Giống như việc bạn đứng chờ nhân viên giao hàng đưa tận tay gói hàng rồi mới mang vào nhà mở ra xem.",
  "skill": "ASYNC_CONCURRENCY"
}
```

Bôi đen `findById` ra `kind: "NAME"`; bôi đen cả vòng `for` ra `kind: "CODE"`. Cả 3 đều qua cổng gác.

**Lên giao diện:** popover cạnh đoạn chọn gồm loại, "là gì" (`what`), "ở đây làm gì" (`here`), ví dụ đời thường (`analogy`, có thể trống), chip kỹ năng. Nếu tên còn dùng ở bài khác thì thêm dòng "còn dùng ở bài …" (`references`).

**Đóng góp:** người mới hỏi được từng chữ trong code mà vẫn bám đúng repo. Lời giải thích không dùng câu hỏi hay đáp án đang mở. Cache dùng chung, nên nhiều người hỏi cùng một chỗ chỉ tốn token lần đầu.

---

## 8. AI và BKT ghép với nhau thế nào

```mermaid
flowchart LR
    AN["② kỹ năng + điểm dở của bài"] --> PL["Kế hoạch câu hỏi<br/>(code, spec/22)"]
    BKT[("Điểm 16 kỹ năng<br/>của người học")] --> PL
    PL --> EN["③ đặt câu hỏi"]
    EN --> GR["④ chấm: ý nào trúng"]
    GR --> UP["Cập nhật BKT (code)<br/>đạt ngay / đạt sau gợi ý / trượt"]
    UP --> BKT
    UP --> ST["Trạng thái bài: xanh / đỏ<br/>mở bài kế tiếp"]
```

- **Bậc** (NOVICE / PRACTITIONER / ARCHITECT) suy từ điểm kỹ năng. Bậc quyết định độ khó câu hỏi và kiểu gợi ý.
- Kỹ năng **có điểm dở** được hỏi trước. Kỹ năng đã thạo vẫn có ít nhất 1 câu (D-34).
- AI không bao giờ tự sửa điểm. Mọi con số BKT do công thức ở server tính.

---

## 9. Số liệu đo ngày 06/11/2026

| Việc | Repo | Kết quả |
| :-- | :-- | :-- |
| Tổng quan đầu phiên | `shop-api` 7 bài / BrewLite 13 bài | 7/7 và 13/13 tên, không trùng, 1 request mỗi repo |
| Phân tích bài | BrewLite 13 bài | 12 đủ, 1 `skeleton_only`; bài 5 bước từng bị cắt ở trần 900 ⇒ nâng 1400 |
| Gợi ý theo bậc | `shop-api` câu "200 sản phẩm" | 6/6 đúng bảng D-74 |
| Câu hỏi | BrewLite 2 bài × 3 câu | Quan hệ và số dòng khớp code; câu `FLOW` đôi khi vẫn hỏi chung (C-04) |
| Giải thích đoạn chọn | `shop-api` 3 vùng | 3/3 đúng loại, qua cổng gác |

## 10. Giới hạn cần nói thật

- **Cổng gác không bảo đảm nghĩa đúng.** Nó chặn tên bịa, công nghệ ngoài repo, số dòng sai, nhưng không chứng minh được câu giải thích đúng nghĩa (GUARD-21). Vì vậy giao diện luôn gắn nhãn "Nhận định của AI".
- **Câu `FLOW` hỏi chung** mới bị chặn ở đúng mẫu chữ "đi qua những bước / hàm nào". Câu kiểu "được chuyển tiếp như thế nào" vẫn lọt, phải duyệt tay.
- Giải thích đoạn chọn cần migration `0002_explain_selection.sql` trên Supabase mới ghi được cache và đếm lượt.
- Gói demo offline `public/demo/mock_bundle.json` còn tổng quan kiểu cũ, cần ghi lại.
- Số token là số đo trên 2 repo nhỏ. Repo lớn hơn (tới 20 bài, nhiều bước) sẽ tốn hơn.

## Đọc thêm

- [`03_ai_va_cong_gac.md`](03_ai_va_cong_gac.md) — bài dễ hiểu cũ về AI và cổng gác (viết khi còn 4 lời gọi).
- [`04_bkt_va_cau_hoi.md`](04_bkt_va_cau_hoi.md) — BKT và kế hoạch câu hỏi.
- `spec/20_AI_GOI_VA_PROMPT.md`, `spec/21_AI_KIEM_VA_DUYET.md`, `spec/22_BKT_VA_KE_HOACH_CAU_HOI.md` — nguồn chuẩn.
