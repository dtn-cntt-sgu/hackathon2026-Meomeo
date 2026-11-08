# 11 — ENGINE TẦNG 1–2: CÚ PHÁP, ĐỒ THỊ GỌI HÀM, LÁT CẮT, NODE

> Bản đồ `CONFIG.DISPLAY_MIN_NODES`–`CONFIG.DISPLAY_MAX_NODES` node tất định, 0 token: symbol, callgraph, lát cắt entry (D-06), cạnh (D-85), nhóm (D-84), budget, tên, tọa độ.
> Input: `IngestOutput` (`10` Mục 0). Output: `StaticEngineResult`; `toClientResult()` ⇒ `ClientStaticEngineResult`.
> Code: `src/server/engine/index.ts` (`runEngine`, `buildGraph`, `toClientResult`) · `src/server/engine/graph/{registry,parser,symbols,callgraph,tarjan,pagerank,complexity,slicing,unclebob,nodes,naming,layout,whitelist,degraded}.ts` · `graph/resolvers/{ts_js,python,java,go,dart,universal}.ts` · `queries/<lang>.scm` · `public/grammars/*.wasm`.
> Kiểu: `02_CONTRACTS.md` · Hằng số: `CONFIG.*` · Luật `ENG-xx` · Bảng mẫu entry theo framework / ngôn ngữ: `12_ENGINE_MAU_ENTRY.md`.

---

## Đọc nhanh


Sơ đồ 13 giai đoạn:

```mermaid
flowchart TB
  subgraph A["Đọc code"]
    direction LR
    G1["G1 PARSE"] --> G2["G2 SYMBOLS"]
  end
  subgraph B["Đồ thị gọi hàm"]
    direction LR
    G3["G3 CALLGRAPH"] --> G4["G4 ENTRIES"] --> G5["G5 MODE"] --> G6["G6 RANK"] --> G7["G7 COMPLEXITY"]
  end
  subgraph C["Dựng node"]
    direction LR
    G8["G8 CANDIDATES"] --> G9["G9 ASSEMBLE"] --> G10["G10 UNCLE_BOB"] --> G11["G11 NAMING"]
  end
  subgraph D["Xuất"]
    direction LR
    G12["G12 LAYOUT"] --> G13["G13 OUTPUT"]
  end
  IN["IngestOutput (10)"] --> A
  A --> B --> C --> D
  D --> OUT["StaticEngineResult"]
```

---

## 0. Giai đoạn, kiểu nội bộ, luật chung

```typescript
// nội bộ — graph/* (FunctionInfo = SymbolDefinition + params, locals, complexity)
interface ExternalCall { caller: string; line: number; receiver_chain: string[]; method: string; import_source: string | null }
interface RouteBinding { file_path: string; line_start: number; line_end: number; kind: "HTTP" | "PAGE" | "SCREEN" | "COMMAND";
  method: string | null; path: string | null; handler: string; middlewares: string[]; display_name: string } // "router.post('/checkout')"
interface EntryPoint { key: string; binding: RouteBinding | null; source: "REGISTERED" | "GENERIC" | "PROGRAM" }
interface Candidate extends Pick<HybridArchitecturalNode, "id" | "node_type" | "entry_symbol" | "trace_steps" | "dto_snippet" |
  "cognitive_complexity" | "rank_score" | "title_source" | "title_evidence"> {
  kind: "SLICE" | "ALGO" | "VNODE"; order_key: string; functions: string[]; binding: RouteBinding | null; base_title: string }
export async function runEngine(src: IngestSource): Promise<StaticEngineResult>;   // runIngest (10) + buildGraph
export function buildGraph(input: IngestOutput): StaticEngineResult;
```

- **ENG-01 Tất định (INV-10).** Duyệt khóa đã sort (UTF-16), cả danh sách kề và Map; ghép theo path; không `Math.random`, không dùng đồng hồ; cộng số thực thứ tự cố định; tọa độ làm tròn.
- **ENG-02** `CONFIG.ENGINE_BUDGET_MS` chỉ sinh warning, không cắt file (D-10).
- Đổi luật làm đổi node/cạnh/id ⇒ tăng `CONFIG.ENGINE_VERSION`.
- **ENG-04** Symbol và cạnh chỉ từ cây Tree-sitter: không regex văn bản thô, không LLM (INV-09).
- **ENG-05 Scope.** Entry, VIP, hàm suy biến chỉ từ file trong `root_dir_offset` (`10` ING-84); lát cắt được ra ngoài scope.

---

## 1. Language Registry & parser — `registry.ts`, `parser.ts`

Mục đích: đuôi ⇒ adapter, grammar, parse. Input: RAMCodeStore. Output: `ParsedFile[]` (`{ path, language, tier, tree, source }`).

```typescript
export const LANGUAGE_REGISTRY: LanguageAdapter[];            // có import_resolver ⇒ RESOLVED, không ⇒ STRUCTURAL
export const KNOWN_NO_GRAMMAR: Record<string, LanguageId>;   // tier UNSUPPORTED (10 ING-77)
export async function initParsers(): Promise<void>;           // 1 lần khi server khởi động
export async function parseAll(code: Map<string, string>, langs: Map<string, LanguageId>, report: IngestionReport): Promise<ParsedFile[]>;
```

- **RESOLVED:** `TYPESCRIPT` `.ts .mts .cts` · `TSX` `.tsx` · `JAVASCRIPT` `.js .jsx .mjs .cjs` (resolver `TS_JS`) · `PYTHON` `.py` · `JAVA` `.java` · `GO` `.go` · `DART` `.dart`.
- **STRUCTURAL** (Universal): `CSHARP` `.cs` · `PHP` `.php` · `KOTLIN` `.kt .kts` · `C` `.c .h` · `CPP` `.cpp .cc .cxx .hpp .hh` · `RUST` `.rs` · `RUBY` `.rb` · `SWIFT` `.swift` · `SCALA` `.scala`.
- **`KNOWN_NO_GRAMMAR`** (UNSUPPORTED): `.sol` SOLIDITY · `.vhd .vhdl` VHDL · `.pas` PASCAL · `.f90 .f95` FORTRAN · `.cob .cbl` COBOL · `.asm` ASSEMBLY · `.abap` ABAP.
- **Bản thi (D-76):** `LANGUAGE_REGISTRY` chỉ có `TYPESCRIPT`, `TSX`, `JAVASCRIPT`, `PYTHON`, `JAVA`; đuôi còn lại ở 2 dòng `RESOLVED`, `STRUCTURAL` xếp vào `KNOWN_NO_GRAMMAR`.

1. **ENG-10** Thêm ngôn ngữ `STRUCTURAL` = 1 dòng registry + `public/grammars/<lang>.wasm` + `queries/<lang>.scm`. Chỉ TS/JS và Python kiểm chứng (INV-09).
2. **ENG-11** `web-tree-sitter`; grammar `RESOLVED` nạp ở `initParsers()`, `STRUCTURAL` nạp từ bundle; không tải mạng; nạp lần đầu không tính `engine_ms`.
3. **ENG-12 Lỗi cú pháp.** $\rho$ = byte node `ERROR` ngoài cùng / byte file. $\rho >$ `CONFIG.PARSE_ERROR_RATIO_MAX` ⇒ bỏ file, `skipped.parse_error++`, warning "File {path} có cú pháp không phân tích được"; ngoài `ERROR` vẫn dùng.
4. Capture `.scm`: `@def.function|method|class|interface|type|var`, `@name`, `@call`, `@import`; `STRUCTURAL` dùng `tags.scm` (`@definition.*`, `@reference.call`).

---

## 2. Bảng symbol — `symbols.ts`, `resolvers/*`

Mục đích: định vị nơi khai báo tên. Input: `ParsedFile[]`, ManifestStore, `module_info`. Output: `SymbolIndex` (`SymbolTable: Map<string, SymbolDefinition>`, `ImportMap`, `FieldTypeMap`, `InterfaceImplMap`, `LocalSymbolIndex`). Hàm: `collectSymbols(files): SymbolIndex`, `resolveImports(files, idx, manifests, module_info): void`.

1. **ENG-20 Khóa.** `file#Name` · `file#Class.method` · `file#<module>` (lệnh cấp cao ngoài định nghĩa/import) · handler ẩn danh: `file#<METHOD path>` (path tĩnh) hoặc `file#<anon@L{dòng}>` · trùng khóa ⇒ hậu tố `~2`, `~3`. `line_start` từ decorator đầu tiên của chính symbol đó; method chỉ tính decorator liền trước nó.
2. **ENG-21 Thu.** Lớp, interface, abstract class (TS `abstract`, Python `ABC`/`Protocol`, Go `interface`), type alias, hàm, method, biến giữ hàm (`const f = () => {}`), method trong `module.exports = {…}`/`export default {…}`, biến module (`VARIABLE`); `export default X` ⇒ alias `file#default`.
   **ENG-21b `is_exported`** theo ngôn ngữ: `12` Mục 3.
3. **ENG-22 `FieldTypeMap`**: tham số constructor có modifier, field có kiểu, `@Autowired`, `self.x = T(...)`, type hint, `Depends(T)`, `x = new T()`, biến export có `new T()`.
4. **ENG-23 `InterfaceImplMap`.** `implements I`, `extends A` (abstract), Python kế thừa ABC; NestJS `{ provide: TOKEN, useClass: X }` + `@Inject(TOKEN)`.
5. **ENG-24 `LocalSymbolIndex`.** Tham số + biến cục bộ (khai báo, destructuring, vòng lặp, catch).
6. **ENG-25 Resolver `RESOLVED`:**
   - `TS_JS`: thử nguyên văn, `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `/index.ts`, `/index.tsx`, `/index.js`; `./x.js` thiếu ⇒ `./x.ts|.tsx`. Alias theo `baseUrl` + `paths` của `tsconfig`/`jsconfig` gần nhất (bỏ `extends`), thiếu ⇒ `@/`, `~/` ⇒ `src/` cạnh `tsconfig`/`package.json` gần nhất. Barrel re-export tới gốc tối đa `CONFIG.BARREL_MAX_DEPTH` bước (`visited`). `require()` = import; `import * as ns` = namespace file.
   - `PYTHON`: `a.b.c` ⇒ `a/b/c.py` | `a/b/c/__init__.py` tiền tố `""`, `src/`, `root_dir_offset`; mỗi `.` đầu lên 1 package.
   - `JAVA`: `fqcn ⇒ file` từ `package` + tên lớp; cùng package không cần import; `a.b.*` ⇒ mọi lớp.
   - `GO`: bỏ tiền tố `go_module_path` ⇒ thư mục; các file cùng thư mục là 1 package.
   - `DART`: `package:<dart_package_name>/x` ⇒ `lib/x`.
7. **ENG-26 Universal (`STRUCTURAL`).** Node import/include/use/require/using chứa `.` `::` `/` `\`; chuẩn hóa `/`, bỏ tiền tố tương đối và đuôi; khớp hậu tố dài nhất; nhiều file ⇒ chọn tiền tố chung dài nhất (hòa ⇒ path nhỏ), `ambiguous`. Chỉ sinh cạnh khi vừa import file đích vừa gọi tên file đích định nghĩa. Cạnh `INFERRED`. Macro, import động có thể sót cạnh; không bịa cạnh.
8. **ENG-27** Import không về file nội bộ ⇒ ghi `import_source` (tên gói) cho tên cục bộ; không sinh cạnh.

---

## 3. Đồ thị gọi hàm — `callgraph.ts`

Mục đích: cạnh cấp hàm cho lát cắt, cạnh cấp file cho xếp hạng. Input: `SymbolIndex`. Output: `FunctionCallEdge[]`, `ExternalCall[]`, `RouteBinding[]`, đồ thị file. Hàm: `buildCallGraph(files, idx): { edges; external; bindings }`, `fileGraph(edges): Map<file, Map<file, { weight; confidence }>>`.

1. **ENG-30** Tập hàm = `FUNCTION`/`METHOD` + `<module>` + handler ẩn danh. Lời gọi trong closure tính cho hàm ngoài.
2. **ENG-31 Phân giải call site** (node `@call`, tên chính xác): (1) `f()`/`this.m()`/`self.m()` ⇒ cùng file/lớp/cha — `RESOLVED`; (2) `f` import trực tiếp — `RESOLVED`; (3) `x.m()`/`this.x.m()` với kiểu `x` trong `FieldTypeMap`, method trong lớp/cha — `RESOLVED`; (4) `C.m()`/`pkg.F()`/`ns.f()` với lớp/pkg/ns đã import — `RESOLVED`; (5) `STRUCTURAL` ⇒ ENG-26 — `INFERRED`; (6) ngôn ngữ `RESOLVED`, receiver không rõ kiểu, `m` trong file import ⇒ cạnh tới mọi ứng viên — `INFERRED`, `ambiguous` nếu > 1; (7) còn lại ⇒ `ExternalCall`.
3. **ENG-32 Interface ⇒ implementation** khi đích là method của `INTERFACE`/abstract class: 1 implementor ⇒ chuyển cạnh; > 1 ⇒ cạnh tới từng implementor, `ambiguous`; 0 ⇒ giữ.
4. **ENG-33 Gộp** theo `(caller, callee)`: `call_count` = số call site; `RESOLVED` nếu ≥ 1 site `RESOLVED`; `ambiguous` = OR. Đệ quy giữ ở đồ thị hàm, bỏ ở đồ thị file.
5. **ENG-34 Cạnh đăng ký route:** hàm chứa lệnh đăng ký ⇒ handler và ⇒ từng middleware, `call_count = 1`, confidence theo phân giải tham chiếu.
6. **ENG-35 Đồ thị file:** `fa → fb` (fa ≠ fb) khi có cạnh hàm giữa hai file; `weight` = Σ `call_count`; `RESOLVED` nếu có cạnh hàm `RESOLVED`.

---

## 4. Entry (Ingress) — `callgraph.ts`

Mục đích: hàm entry đã đăng ký (D-06); chạy trước Mục 5. Output: `RouteBinding[]`, `EntryPoint[]` sort theo `key`.

1. **ENG-40 Mẫu đăng ký** (`ingress_patterns`) theo framework: bảng ở `12` Mục 1.
2. **Đối số.** Tham chiếu tên ⇒ ENG-31 (1)–(6). Hàm ẩn danh ⇒ symbol tổng hợp (ENG-20), `display_name` = `<receiver>.<verb>('<path>')`. Lời gọi bọc (`asyncHandler(ctrl.create)`) ⇒ hàm trong; factory (`validate(schema)`) ⇒ middleware = factory. `path` = tiền tố mount (`visited`); không tĩnh ⇒ `null`; mount nhiều nơi ⇒ path nhỏ nhất. `line_start/line_end` = câu lệnh đăng ký.
3. **Entry chung** (adapter không có `ingress_patterns`, hoặc có nhưng không mẫu nào khớp trong repo — D-58): file có segment/token cuối stem thuộc danh sách `12` Mục 2 và in-degree 0 đồ thị file ⇒ hàm/method export (ENG-21b) là entry, `GENERIC`.
4. **Entry chương trình** (ENG-51.3, D-58): theo `12` Mục 2; `PROGRAM`.
5. **Ingress file** = file chứa ≥ 1 entry `REGISTERED`/`GENERIC` (ứng viên Hub, D-09).

---

## 5. Chọn chế độ — `degraded.ts`

1. Sau Mục 4. `n` = số file đã parse trong scope.
2. **ENG-51 Bảng quyết định** (dòng đầu khớp; `degraded_mode` áp cả repo):
   1. Có entry `REGISTERED`/`GENERIC` ⇒ NORMAL (`null`).
   2. `n ≤ CONFIG.PROCEDURAL_MAX_FILES` ⇒ `PROCEDURAL` (Mục 10).
   3. Còn lại ⇒ NORMAL (`null`) với các entry `PROGRAM` nếu có; không có entry ⇒ chỉ có node thuật toán theo ENG-90 (D-54).

---

## 6. Tarjan & PageRank — `tarjan.ts`, `pagerank.ts`

**Mục đích:** xếp hạng file, không chọn node. **Input:** đồ thị file. **Output:** `rank_score` theo file. Hàm: `tarjanScc(nodes, adj): string[][]`, `pageRank(dag): Map<string, number>`.

1. **ENG-60 Tarjan** (DFS theo khóa sort, bỏ self-loop) ⇒ SCC; co SCC thành 1 đỉnh ⇒ DAG co cụm. File nhận điểm của đỉnh chứa nó.
2. **SCC khổng lồ.** SCC lớn nhất `> CONFIG.GIANT_SCC_RATIO × số file` ⇒ bỏ cạnh nội bộ `weight` nhỏ nhất (hòa ⇒ `(source, target)` nhỏ nhất), chạy lại; tối đa `CONFIG.GIANT_SCC_MAX_WEAK_EDGE_REMOVALS` lần; vẫn khổng lồ ⇒ warning "Phát hiện cụm phụ thuộc vòng lớn ({k} file)". Chỉ áp đồ thị xếp hạng; đồ thị hàm, lát cắt, `degraded_mode` không đổi.
3. **ENG-62 PageRank** trên DAG co cụm, `N` đỉnh, $PR_0 = 1/N$, $d$ = `CONFIG.PAGERANK_DAMPING`:
   $$PR_{k+1}(u) = \frac{1-d}{N} + d\Big(\sum_{v \to u} \frac{PR_k(v)}{L(v)} + \frac{1}{N}\sum_{L(w)=0} PR_k(w)\Big)$$
   Tối đa `CONFIG.PAGERANK_MAX_ITER` vòng; dừng khi $\sum|PR_{k+1}-PR_k| <$ `CONFIG.PAGERANK_TOLERANCE`; `N = 1` ⇒ 1.
4. (D-09) `rank_score(f) = PR(f) + CONFIG.INGRESS_BONUS · 1[f là Ingress file]`. Hub chỉ là Ingress file (chuỗi Controller → Service → Repository không thưởng hội tụ); PageRank chỉ xếp hạng; không lọc "utility sink".

---

## 7. Cognitive Complexity & VIP — `complexity.ts`

1. Mỗi hàm/method; `<module>` tính trên câu lệnh cấp cao trừ thân định nghĩa; closure/lambda tính vào hàm chứa.
2. **ENG-71 Điểm** (SonarQube):

| Cấu trúc | Điểm |
| :-- | :-- |
| `if` (không else-if), ba ngôi / điều kiện Python, `switch`/`match`, `for`/`for-in`/`for-of`/`while`/`do-while`, `catch`/`except` | +1 **+ mức lồng** |
| `else if`/`elif`, `else` | +1, **không** cộng mức lồng |
| Đoạn toán tử logic cùng loại liền nhau (`&&`, `\|\|`, `and`, `or`) | +1 |
| `goto`, `break`/`continue` có nhãn; hàm tự gọi chính nó (1 lần / hàm) | +1 |

3. **Mức lồng** tăng khi vào thân `if`/`else if`/`else`, `switch`, vòng lặp, `catch`, ba ngôi, hàm/lambda lồng; `try`/`finally` không tăng. Theo loại node AST, không đếm ngoặc.
4. **VIP** = `complexity > CONFIG.VIP_COMPLEXITY_MIN`.
5. **ENG-74 Dự phòng** (ENG-90): không VIP ⇒ tối đa `CONFIG.VIP_FALLBACK_TOP_K` hàm có `complexity ≥ CONFIG.VIP_FALLBACK_MIN_SCORE`; không hàm nào đủ ngưỡng ⇒ không sinh node thuật toán (D-54, D-61). Thứ tự: `complexity` giảm, `rank_score` file giảm, khóa tăng.

---

## 8. Lát cắt — `slicing.ts`

Mục đích: 1 entry ⇒ 1 `Candidate` `SLICE` (D-06). Input: `EntryPoint`, đồ thị hàm, `ExternalCall[]`, AST. Output: `Candidate`.

```typescript
export function buildSlice(entry: EntryPoint, ctx: EngineContext): Candidate;
```

1. **ENG-80 Thu hàm (1 step = 1 hàm).** Thứ tự: entry (hop 0) ⇒ từng middleware của `binding` (hop 1) kèm hàm nó gọi ⇒ hàm entry gọi. DFS tiền thứ tự, callee theo (dòng, cột) call site rồi khóa; chỉ hàm có thân; mỗi hàm 1 lần; dừng ở hop `CONFIG.SLICE_MAX_HOPS`. Call site `ambiguous` ⇒ 1 đích: file có tiền tố chung dài nhất với caller, hòa ⇒ khóa nhỏ.
2. **ENG-81 Lọc liên quan.** Bỏ hàm vặt (D-87). Callee `G` (không là entry/middleware) giữ khi: cây con `G` có `DATA_SINK`, hoặc giá trị trả về ở ≥ 1 site được dùng (gán, return, đối số, điều kiện), hoặc `G` có `throw`/`raise`. Không ⇒ bỏ `G` và hàm chỉ đến qua `G` (VD `logger.info(x)`).
3. **ENG-82 Layer** (ưu tiên trên xuống): entry ⇒ `ENTRY_POINT`; middleware ⇒ `MIDDLEWARE`; file có segment/token cuối stem ∈ {repository, repositories, repo, repos, dao, daos, model, models, entity, entities} ⇒ `DATA_ACCESS`; hàm có `DATA_SINK` và không gọi hàm nào ở file trên ⇒ `DATA_ACCESS`; còn lại ⇒ `BUSINESS_LOGIC` (VD service gọi `categoryRepo.findById` ⇒ `BUSINESS_LOGIC`).
4. **Mẫu.** `DATA_SINK` = `ExternalCall` khớp: (a) method ∈ {save, insert\*, update\*, delete\*, remove, find\*, create, upsert, query, execute, exec, aggregate, count, get, add, commit} và receiver khớp `/(repository|repo|model|dao|entity|db|database|prisma|knex|pool|conn|connection|client|session|cursor|collection|datasource|manager|tx|trx|jdbcTemplate)$/i` hoặc chuỗi receiver, sau khi bỏ `this.`, có đoạn `prisma`, `tx`, `trx`; (b) receiver có `import_source` ∈ {pg, mysql, mysql2, mongodb, mongoose, sequelize, typeorm, @prisma/client, sqlite3, better-sqlite3, redis, ioredis, knex, sqlalchemy, psycopg2, pymongo, database/sql, gorm.io/gorm}; (c) receiver viết hoa + method ∈ (a) khi `tech_stack` có mongoose/sequelize/typeorm. `OUTPUT` = `res.json|send|status|render|redirect|end|sendStatus`, `reply.send`, `next(…)`, `return jsonify|Response|HttpResponse(…)`, `print`, `fetch`/`axios.*`, `setState`/`set<X>`. Không gồm `console.*`, `logger.*`, `logging.*`.
5. **Criterion:** câu lệnh `DATA_SINK` đầu tiên theo (thứ tự bước, dòng); không có ⇒ `OUTPUT` cuối của entry; không ⇒ `return` cuối của entry; không ⇒ dòng cuối thân entry.
6. **Dòng giữ trong hàm `F`** (ghép chỉ giữ header + dòng đóng):
   - *Hạt giống:* câu lệnh chứa call site tới callee giữ, `DATA_SINK`, `OUTPUT`; `return`/`throw`/`raise`/`yield`.
   - *Def-use lùi:* với câu lệnh giữ và tên `v` đọc, giữ định nghĩa `v` trong `F` (khai báo, gán, destructuring, vòng lặp, catch, `v.push(…)`, `v.x = …`) trước nó hoặc trong vòng lặp; lặp tới bất động. `v` biến module cùng file ⇒ giữ khai báo trong snippet.
   - *Điều khiển:* header + dòng đóng câu ghép bao câu lệnh giữ (gồm `else`, `case`, `catch`, `finally`); **guard clause** = `if` trước câu lệnh giữ có thân kết thúc bằng `return`/`throw`/`raise`/`continue`/`break`/`sys.exit`/`res.status(4xx|5xx)`.
   - Giữ chữ ký (`line_start` tới mở thân) và dòng đóng. Handler ẩn danh: snippet = cả câu lệnh đăng ký.
7. **ENG-86 Elision & map.** Mỗi đoạn ≥ 1 dòng không rỗng bị bỏ ⇒ marker `<thụt lề dòng bỏ đầu><comment_prefix> … (<n> dòng)`, `snippet_line_map` = 0; dòng rỗng bỏ qua. `line_start`/`line_end` = min/max ≠ 0 của map. `function_name` = `Class.method` / tên hàm / `display_name`. File ảo ⇒ `origin_note = originNoteFor(…)` (`10` ING-102).
8. **ENG-87 Hard Clamp** khi bước > `CONFIG.STEP_MAX_LINES` dòng: giữ chữ ký `S`, dòng đóng `C`, cửa sổ $W = \min(\texttt{CLAMP\_WINDOW\_LINES}, \texttt{STEP\_MAX\_LINES} - |S| - |C| - 2)$ dòng trên dòng giữ, chứa mốc (criterion nếu có, không ⇒ call site đầu tới bước kế, không ⇒ hạt giống đầu). Ngoài cửa sổ ⇒ ≤ 2 marker. $W < 1$ ⇒ `S` rút còn dòng đầu.
9. **ENG-88 Trần node.** `lines` = Σ dòng snippet; `tokens` = ⌈Σ ký tự / `CONFIG.CHARS_PER_TOKEN`⌉. Vượt `CONFIG.NODE_MAX_LINES` hoặc `CONFIG.NODE_MAX_CODE_TOKENS` ⇒ (a) bỏ bước lá không bảo vệ có hop lớn nhất (hòa ⇒ `step_number` lớn); bảo vệ = entry, middleware, hàm trên đường tới criterion; (b) chỉ còn bước bảo vệ ⇒ giảm `W` bước dài nhất đi 1 và clamp lại (tối thiểu 1). Đánh số lại `step_number` 1..n.
10. **ENG-89 `dto_snippet`.** Tên kiểu trong dòng giữ (generic, `new T`, `as T`, `@Body() dto: T`) ⇒ `INTERFACE`/`TYPE`, `CLASS` dữ liệu (field/constructor, đuôi Dto/Request/Response/Input/Payload/Schema/Model/Entity, `@dataclass`, kế thừa `BaseModel`) hoặc biến module đuôi `Schema`; trừ lớp các bước. Tham chiếu đầu rồi khóa; tổng ≤ `CONFIG.STEP_MAX_LINES` dòng (vượt ⇒ đầu + marker); thiếu ⇒ `""`.

---

## 9. Node thuật toán — `nodes.ts`

1. **ENG-90 Khi nào tạo.** (a) VIP trong scope không là bước lát cắt (sau ENG-81, ENG-88). (b) NORMAL có `< CONFIG.DISPLAY_MIN_NODES` candidate sau ENG-110 ⇒ thêm hàm có `complexity ≥ CONFIG.VIP_FALLBACK_MIN_SCORE` (thứ tự ENG-74). `<module>`, hàm trả JSX (D-86) không là ứng viên của (a), (b).
2. **ENG-91 Chia bước** (các bước cùng `function_name`). Câu chính = vòng lặp cấp 1 nhiều dòng nhất (hòa ⇒ đầu tiên); thiếu ⇒ câu có điểm ENG-71 lớn nhất. `ALGO_SETUP` = chữ ký + câu trước; `ALGO_EXECUTION` = câu chính; `ALGO_TERMINATION` = câu sau + đóng. Không câu điều khiển ⇒ SETUP = mọi câu trừ cuối, TERMINATION = câu cuối. Bỏ bước rỗng; clamp ENG-87 (mốc: trước câu chính / header / câu đầu); rồi ENG-88, ENG-89.
3. `ALGORITHMIC_CORE`; `entry_symbol` = khóa hàm; `cognitive_complexity = complexity`; `rank_score` = của file chứa hàm; `is_vip_algorithm = true`; `functions = [khóa]`.

---

## 10. Chế độ suy biến `PROCEDURAL` — `degraded.ts`

1. **P1.** Entry giả = mọi hàm (cả `<module>`) có ≥ 1 câu lệnh trong file scope ⇒ Mục 8 (không binding) ⇒ gộp ENG-110 ⇒ cạnh ENG-112.
2. **P2.** Chạy khi P1 có `< CONFIG.FUNCTION_GRAPH_MIN_NODES` candidate, 0 cạnh, hoặc hàm dài nhất `> CONFIG.LONG_FUNCTION_LINES` dòng. `M` = hàm nhiều dòng nhất (hòa ⇒ khóa nhỏ). Câu lệnh cấp 1 của `M` nhận nhãn: `DATA` (`DATA_SINK`) · `VALIDATE` (guard clause, `assert`, `.parse(`/`.validate(`) · `INPUT` (đọc `req.body|params|query`, `request.json|args`, `input(`, `sys.argv`, `process.argv`, `parse_args(`, `Scanner`) · còn lại `COMPUTE_OUTPUT`. Mỗi nhãn có lệnh ⇒ 1 node ảo; < 2 nhãn ⇒ bỏ P2. Kết quả = node ảo của `M` + candidate P1 không chứa `M`.
3. **ENG-102 Node ảo.** `id = vnode-<hash6(file_path + "#" + NHÃN)>`; 1 bước, layer `INPUT`⇒`ENTRY_POINT`, `VALIDATE`⇒`MIDDLEWARE`, `COMPUTE_OUTPUT`⇒`BUSINESS_LOGIC`, `DATA`⇒`DATA_ACCESS`; snippet = chữ ký + lệnh nhãn (ENG-86, ENG-87 mốc = câu đầu nhãn); `entry_symbol = null`; `functions = []`; `ARCHITECTURAL_DATA_FLOW`; `is_vip_algorithm = false`; `cognitive_complexity` = tổng điểm ENG-71; `rank_score` = của file. Cạnh: chuỗi theo dòng đầu mỗi nhãn, `RESOLVED` (ngoại lệ D-07 vì cùng `M`). Node ảo là chặng code thật của `M`, không phải node gom nhóm.

---

## 11. Ghép node, id, cạnh, Display Budget, Capstone — `nodes.ts`

1. **ENG-110 Lọc, gộp.** Candidate sạch = `files[0]` không mang cờ ING-87. Đủ `CONFIG.DISPLAY_MIN_NODES` candidate sạch ⇒ bỏ mọi candidate mang cờ. Có candidate sạch nhưng thiếu ⇒ giữ candidate sạch, bù candidate mang cờ cho đủ `CONFIG.DISPLAY_MIN_NODES` (`rank_score` giảm, `cognitive_complexity` giảm, `id` tăng). Không có candidate sạch ⇒ giữ nguyên. Candidate bị bỏ không cộng `omitted_node_count`. Cùng tập `functions` ⇒ giữ `order_key` nhỏ nhất (`order_key` = `entry_symbol`; node ảo = khóa băm). Tập con không gộp.
2. **ENG-111 Tên gốc & id (D-08).** Thang tên Mục 13 chạy trên mọi candidate ⇒ `base_title`, `title_source`, `title_evidence`. `slug(t)`: NFD bỏ dấu, `đ`⇒`d`, lowercase, ngoài `[a-z0-9]` ⇒ `-`, gộp `-`, bỏ `-` hai đầu, cắt `CONFIG.TITLE_MAX_CHARS` ký tự, rỗng ⇒ `node`. `hash6(s)` = 6 hex đầu SHA-1(UTF-8). Lát cắt `slice-<slug(base_title)>-<hash6(entry_symbol)>`; thuật toán `algo-<slug>-<hash6(khóa hàm)>`; node ảo ENG-102.
3. **ENG-112 Cạnh `G0` (D-85).** Dựng theo ENG-118. **Dễ hơn (D-07):** `cognitive_complexity` nhỏ hơn; hòa ⇒ `rank_score` lớn hơn; hòa ⇒ `id` nhỏ hơn. **Cặp D-07:** `functions` giao ≠ ∅. **Cặp D-56:** lát cắt `S` – node thuật toán `T` mà hàm của `T` đến được từ 1 hàm của `S.functions` trên đồ thị hàm (BFS mọi độ sâu, `visited`; callback, gọi động không có cạnh ⇒ không tính). Cặp D-07, D-56 có chiều bài dễ tới bài khó. `G0` không chu trình (assert `tarjanScc`).
4. Rút gọn bắc cầu `G0` ⇒ `G0r` (bỏ `u → v` khi còn đường dài ≥ 2).
5. **ENG-114 Display Budget.** `max = CONFIG.DISPLAY_MAX_NODES`. ≤ `max` ⇒ giữ hết. Ngược lại: (1) đường dài nhất trên `G0r` (DP theo Kahn, hòa ⇒ `id` nhỏ), chọn đỉnh trước/cuối dài nhất, hòa ⇒ `rank_score` lớn, hòa ⇒ `id` nhỏ; giữ tối đa `CONFIG.CRITICAL_PATH_MAX_NODES` node đầu; (2) thêm theo D-88, mỗi loại theo: `cognitive_complexity > CONFIG.VIP_COMPLEXITY_MIN` trước, `rank_score` giảm, `cognitive_complexity` giảm, `id` tăng. Bỏ không gộp file. Số node bị bỏ ⇒ `ingestion_report.omitted_node_count` + warning "{n} luồng khác không hiển thị trên bản đồ".
6. **Cạnh trên tập giữ `K`** = rút gọn bắc cầu của `{(u,v) ∈ K² : v đến được từ u trong G0}`. `confidence = RESOLVED` khi: cạnh D-07 có hàm chung `f` mà đường DFS (ENG-80) tới `f` ở cả hai lát cắt toàn `RESOLVED`; hoặc cặp D-56 có đường gọi toàn `RESOLVED`; hoặc cạnh có 1 thực thể đọc từ code ở cả 2 đầu; hoặc đường trong `G0` toàn `RESOLVED`; hoặc là cạnh node ảo. Còn lại `INFERRED`. `via_entities` (sort): thực thể tạo cạnh trong `G0`; cạnh qua node bị bỏ ⇒ thực thể chung của 2 đầu; còn lại `[]`. `GraphEdge.id = "${source}->${target}"`; `prerequisites` = nguồn cạnh vào, sort. **Điểm bắt đầu** (D-85) = node có cạnh ra, `prerequisites = []`. **Học riêng** = node không có cạnh nào, không khóa. Nút `__start__` (Mục 14) không nằm trong `nodes`.
7. **Nhóm:** ENG-119 chạy trên `K` sau ý 6.
8. **Capstone (D-12).** Trong node cuối, có node sạch (ENG-110) thì chỉ xét node sạch: `cognitive_complexity` lớn nhất, hòa ⇒ `rank_score` lớn nhất, hòa ⇒ `id` nhỏ nhất; đúng 1.
9. **Trường.** `files` = file các bước theo thứ tự, không trùng; `languages` = `LanguageId` của `files`, sort; `support_tier` = `STRUCTURAL` nếu có file `STRUCTURAL`, ngược lại `RESOLVED`; lát cắt: `cognitive_complexity` = max `complexity` các hàm (D-12), `rank_score = rank_score(files[0])`, `ARCHITECTURAL_DATA_FLOW`, `is_vip_algorithm = false`.
10. 0 node sau mọi bước ⇒ `ERR_NO_ARCHITECTURAL_SLICE`.

### 11.1. B-39: thực thể, cạnh dữ liệu, nhóm (D-84, D-85)

Node thuật toán, node ảo có `entities = []`.

1. **ENG-116 Thực thể.** Xét mọi `ExternalCall` khớp `DATA_SINK` (Mục 8) của hàm là bước, mọi layer, theo (`step_number`, dòng).
   - **Tên**, luật đầu khớp thắng: (a) đoạn sau `prisma`, `tx`, `trx` của receiver; (b) receiver viết hoa (mẫu c); (c) `T` của `Repository<T>`, `JpaRepository<T, …>`, `@InjectRepository(T)` ở field receiver; (d) đoạn cuối receiver có đuôi ENG-82, bỏ đuôi khác rỗng (`orderRepo` ⇒ `Order`); (e) file có segment ENG-82 ⇒ tên lớp bỏ đuôi đó, thiếu lớp ⇒ stem file. Không khớp ⇒ bỏ lời gọi. Tách token, số ít (`normalizeTokens` 1, 4), ghép PascalCase.
   - **Thao tác:** `create`, `insert*`, `add`, `upsert`, `save` ⇒ `CREATE`; `update*` ⇒ `UPDATE`; `delete*`, `remove` ⇒ `DELETE`; `find*`, `get`, `count`, `aggregate`, `query` ⇒ `READ`; còn lại bỏ. `save` sau `find*`, `get` cùng thực thể ⇒ `UPDATE`.
   - **Từ route:** bài `HTTP` không có thực thể từ code, có `S` (Mục 13 bậc 1) ⇒ thực thể `Singular(S[0])`: `POST` ⇒ `CREATE` (`S[-1]` ∈ `ACTION_SEGMENTS` trừ `register` ⇒ `READ`), `GET` ⇒ `READ`, `PUT`, `PATCH` ⇒ `UPDATE`, `DELETE` ⇒ `DELETE`.
   - `entities` sort theo `name`; `ops` theo thứ tự `EntityOp`, không trùng.
   - **Thực thể chính:** thực thể đầu tiên có thao tác ghi; không ghi ⇒ thực thể đầu tiên.
2. **ENG-117 Khóa ngoại** `E → P`: `@relation` trong `schema.prisma`, `@ManyToOne` của TypeORM, JPA (`E` chứa field, `P` là kiểu field). `schema.prisma` đọc theo dòng, ngoại lệ của ENG-04.
3. **ENG-118 Dựng `G0`** theo thứ tự:
   1. `source(E)` = bài dễ nhất có `CREATE` từ code; không có ⇒ bài dễ nhất có `CREATE` từ route; không có ⇒ bài dễ nhất có `E`.
   2. `source(E)` → mọi bài khác có `E`. Bài có `CREATE` `E`, `E → P`, `source(P)` khác bài đó ⇒ `source(P)` → bài đó. Cùng cặp ⇒ 1 cạnh, hợp thực thể.
   3. Bài không có thực thể từ code, chưa có cạnh ⇒ thêm mọi cặp D-07 chứa bài đó.
   4. Thêm cặp D-56.
   5. `tarjanScc`: trong SCC trên 1 đỉnh, bỏ cạnh từ bài khó tới bài dễ.
4. **ENG-119 Nhóm (`groups`).** Mỗi node đúng 1 nhóm, bỏ nhóm rỗng.
   - `STANDALONE`: `ALGORITHMIC_CORE`, node không có cạnh hoặc không có thực thể chính. `key = "Học riêng"`, `group_id = "group-standalone"`.
   - Còn lại theo thực thể chính, `key` = tên thực thể. Có bài đọc được từ code ⇒ `ENTITY`, `group_id = "group-entity-<slug(key)>"`; không ⇒ `ROUTE_PREFIX`, `group_id = "group-route-<slug(key)>"`.
   - `depth` = đường dài nhất từ điểm bắt đầu. `node_ids` sort theo (`depth`, `id`); `groups` theo (`depth` nhỏ nhất, `group_id`), `STANDALONE` cuối.

---

## 12. Uncle Bob — `unclebob.ts`

1. **ENG-120** `S` = `files` của node. `Ce` = file ngoài `S` là đích cạnh đồ thị file từ `S`; `Ca` = file ngoài `S` có cạnh vào `S`. $I = C_e/(C_a+C_e)$.
2. `Na` = kiểu trừu tượng khai báo trong `S` (`INTERFACE`, abstract class, `TYPE` dạng object, Python `ABC`/`Protocol`, Go `interface`, loại trong `abstraction_kinds`); `Nc` = lớp/struct cụ thể. $A = N_a/(N_a+N_c)$, $D = |A+I-1|$.
3. **Miễn trừ** (`is_exempt`, `I = A = D = 0`, `BALANCED`): node ảo; archetype ∈ {WEB_FRONTEND, MOBILE_APP, DESKTOP_APP} và `files[0]` là UI (`.tsx/.jsx`, `.vue/.svelte`, `.dart` import react/vue/svelte/flutter); mọi file của `S` là `JAVASCRIPT` hoặc `STRUCTURAL` thiếu `abstraction_kinds`; `Ca + Ce = 0`; `Na + Nc = 0`.
4. `D < CONFIG.UNCLE_BOB_BALANCED_MAX_D` ⇒ `BALANCED`; `D ≥ CONFIG.UNCLE_BOB_ZONE_MIN_D` và `A + I < 1` ⇒ `ZONE_OF_PAIN`; `D ≥ CONFIG.UNCLE_BOB_ZONE_MIN_D` và `A + I > 1` ⇒ `ZONE_OF_USELESSNESS`; còn lại `BALANCED`.

---

## 13. Đặt tên tất định — `naming.ts`

Mục đích: `title`, `title_source`, `title_evidence` từ code (0 token AI). Bậc đầu hợp lệ thắng; bậc 5 luôn thành công.

1. **`normalizeTokens`.** (1) Tách camelCase/PascalCase (`HTTPServer` ⇒ http, server), `_`, `-`, `.`, `/`. (2) Bỏ `TECH_TOKENS` = controller ctrl service svc repository repo dao model entity dto schema handler handle impl manager helper util utils router route routes view views api endpoint module index main base abstract interface default async sync, đoạn `v\d+`; bỏ `I` khi ký tự 2 viết hoa. (3) Bỏ số và token `< CONFIG.TITLE_MIN_TOKEN_CHARS`, trừ `ACRONYMS` = id ui ai io os qr. (4) Số ít: `-ies`⇒`-y`, `-sses`⇒`-ss`, `-s`⇒`""` (bỏ qua nếu ≤ `CONFIG.TITLE_MIN_TOKEN_CHARS` hoặc đuôi `ss|us|is`). (5) Title Case; `ACRONYMS` và từ viết hoa giữ in hoa. (6) Định danh phi ASCII chỉ tách token.
2. **Bậc 1 `ROUTE`** (cần binding). Đoạn path chỉ nhận `[A-Za-z0-9_-]`, dài ≤ `CONFIG.ROUTE_SEGMENT_MAX_CHARS`; bỏ đoạn dài ≥ `CONFIG.HIGH_ENTROPY_MIN_CHARS` có entropy > `CONFIG.HIGH_ENTROPY_MIN_BITS` bit/ký tự, `api`, `v\d+`, tham số (`:id`, `{id}`, `<int:id>`, `[id]`) ⇒ đoạn tĩnh `S`, tách `-`, `_` thành từ. `HTTP`: `S[-1]` ∈ `ACTION_SEGMENTS` = cancel login logout register search verify refresh reset health ⇒ `S[-1]` + `Singular(S[-2])` nếu có, bỏ `S[-2] = auth`; `DELETE` có `|S| ≥ 2` ⇒ `Delete Singular(S[-2]) Singular(S[-1])`; còn lại `|S| ≥ 2` hai đoạn cuối liền ⇒ `Singular(S[-2]) S[-1]`; có tham số xen ⇒ mẫu 1 đoạn `S[-1]` + `Singular(S[-2])`; `|S| = 1`: POST Create X, GET tham số cuối Get X, GET List Xs, PUT/PATCH Update X, DELETE Delete X; `|S| = 0`/path `null` ⇒ bỏ bậc. `PAGE`/`SCREEN`/`COMMAND` ⇒ tên + Page/Screen/Command. Evidence `"<METHOD> <path>"`.
3. **Bậc 2 `ENTRY_SYMBOL`.** `normalizeTokens(tên entry)`, bỏ token đầu `post|put|patch`; còn 1 token ⇒ ghép tài nguyên từ tên lớp chứa. Rỗng hoặc toàn `GENERIC_NAMES` = main run start init handler callback cb fn func process execute exec test tmp temp foo bar `<module>` default anonymous ⇒ bỏ bậc. Evidence = khóa bỏ `file#`.
4. **Bậc 3 `DOMAIN_TERMS`.** Token (bỏ `GENERIC_NAMES`) từ tên lớp/hàm/interface/DTO trong `files`; $\text{score}(t) = \text{tf}(t)(\ln\frac{1+N}{1+\text{df}(t)}+1)$, `N` = `|file_index|`, `df` = số file chứa `t`. Tối đa `CONFIG.DOMAIN_TERMS_MAX` token cao nhất có `tf ≥ CONFIG.DOMAIN_TERM_MIN_TF`, nối `" / "`. Evidence `"order×6, inventory×3"`.
5. **Bậc 4 `DIRECTORY`.** Thư mục đầu tiên (ngược từ `files[0]`) ∉ `GENERIC_DIRS` = src lib app internal pkg cmd main java kotlin com org net controllers services repositories repos routes handlers api modules core common shared utils components pages views features domain infra infrastructure.
6. **Bậc 5 `FILE_BASENAME`.** Basename `files[0]` bỏ đuôi và vai trò ⇒ `normalizeTokens`; rỗng ⇒ basename nguyên.
7. **Đặc biệt.** Node ảo: `"<tên gốc>: <Chặng>"` (tên gốc = bậc 2→5 trên `M`; Chặng = Input / Validation / Compute & Output / Data Access), `VIRTUAL`.
8. **Giới hạn.** Tối đa `CONFIG.TITLE_MAX_TOKENS` token (không tính hậu tố khử trùng); ký tự: chữ, số, khoảng trắng, `/ & : - ( ) #`; không lấy chữ từ comment/string. Cắt `CONFIG.TITLE_MAX_CHARS` + `…` thuộc UI.
9. **Khử trùng (sau Display Budget).** Duyệt node theo `id`; nhóm `base_title` trùng: (1) cùng `ROUTE` khác method ⇒ `" (GET)"`…; (2) còn trùng ⇒ thư mục gần nhất khác nhau của `files[0]` `" (cart)"`; (3) còn trùng ⇒ `" #2"`, `" #3"` theo `id` ⇒ `title`. `id` không đổi.

---

## 14. Bố cục — `layout.ts`

1. Chỉ node có cạnh vào Dagre. `@dagrejs/dagre` (ranker `network-simplex`): `rankdir = CONFIG.DAGRE_RANKDIR`, `ranksep = CONFIG.DAGRE_RANKSEP`, `nodesep = CONFIG.DAGRE_NODESEP`; `setNode(id, { width: CONFIG.NODE_BOX_WIDTH, height: CONFIG.NODE_BOX_HEIGHT })` theo `id` tăng; `setEdge` theo `GraphEdge.id` tăng, `{ weight: 1, minlen: 1 }`.
2. **Hàng điểm bắt đầu (D-55, D-85).** Thêm nút `__start__` (`width = height = 0`) và cạnh `__start__ → r` cho mọi điểm bắt đầu `r` theo `id` tăng, `{ weight: (|E| + 1)(|V| + 1), minlen: 1 }` (`|V|`, `|E|` của đồ thị thật). Trọng số này lớn hơn mọi phần lợi khi đẩy 1 điểm bắt đầu xuống ⇒ mọi điểm bắt đầu cùng hạng ngay dưới `__start__` = hàng trên cùng. `dagre.layout(g)` rồi bỏ `__start__`.
3. `position = { x: round(cx − CONFIG.NODE_BOX_WIDTH/2), y: round(cy − CONFIG.NODE_BOX_HEIGHT/2) }`. Trạng thái node suy ra ở `03` §5.1.
4. **Cột Học riêng.** Node không có cạnh, `id` tăng, `i` từ 0: `x = X + CONFIG.NODE_BOX_WIDTH + CONFIG.DAGRE_NODESEP`, `y = Y + i·(CONFIG.NODE_BOX_HEIGHT + CONFIG.DAGRE_NODESEP)`; `X`, `Y` = `x` lớn nhất, `y` nhỏ nhất của node Dagre, không có ⇒ `x = Y = 0`.

---

## 15. Whitelist, file_index, kết quả — `whitelist.ts`, `index.ts`

```typescript
export function buildSymbolWhitelist(idx: SymbolIndex, finalStepFunctions: string[]): string[];
export function toClientResult(r: StaticEngineResult): ClientStaticEngineResult;
export function mainPath(graph: StaticEngineResult): string[];   // → RepoOverviewView.facts.main_path_node_ids
```

1. **`symbol_whitelist` (D-19, phạm vi repo):** (a) `name` mọi `SymbolDefinition` (hàm, method, lớp, interface, type, biến module) + `Class.method`; (b) field/property trong lớp, interface, type object, dataclass/pydantic, struct; (c) tham số + biến cục bộ (ENG-24) của hàm là bước trong node cuối. Bỏ tên chứa `<`; giữ dạng gốc; bỏ trùng; sort UTF-16. Chuẩn hóa khi so thuộc `21`. Không chứa `tech_stack`.
2. `file_index` = path file parse thành công (sau ENG-12), sort; `total_files = ingestion_report.code_file_count`.
3. **Report.** Điền `skipped.parse_error`, `degraded_mode`, `engine_ms` = `performance.now()` cuối G13 − đầu G1. `engine_ms > CONFIG.ENGINE_BUDGET_MS` ⇒ warning, không đổi hành vi. Ghi theo thứ tự giai đoạn.
4. `engine_version = CONFIG.ENGINE_VERSION`; `repo_name`, `snapshot`, `fingerprint` từ `IngestOutput`; `nodes`, `edges` sort theo `id`; `groups` theo ENG-119.
5. **`toClientResult`** dựng object mới từng trường (API-03, không spread): mọi trường trừ `symbol_whitelist`; `ingestion_report` trừ `suspicious_instruction_files`.
6. **ENG-155 `mainPath`** (chỉ đọc `nodes`, `edges`): đường dài nhất trên DAG bằng DP như ENG-114 (1) nhưng không giới hạn `CONFIG.CRITICAL_PATH_MAX_NODES`, hòa chỉ theo `id` nhỏ hơn (tô-pô Kahn). Trả `id` từ gốc tới cuối; rỗng ⇒ `[]`. Dùng cho `RepoOverviewView.facts.main_path_node_ids` (`20`).

---

## Test bắt buộc

| ID | Input | Kỳ vọng |
| :-- | :-- | :-- |
| T-ENG-01 | `findPath`: `if (!graph \|\| !start)` lồng 0 · `for` 0 · `if` 1 · `for` 2 · `if` 3 | 2+1+2+3+4 = **12** |
| T-ENG-02 | `for (x of items) { if … else if … else … }` (TS và Python `elif`) · `a && b \|\| c` | 1+2+1+1 = **5** (else-if không cộng mức lồng; cách cũ ra 6) · +2 |
| T-ENG-05 | PageRank chuỗi C → S → R, d 0.85, ≤ 20 vòng, tol 1e-6 | ≈ 0.1844 / 0.3412 / 0.4744 (±1e-3); C Ingress ⇒ ≈ 0.6844 |
| T-ENG-06 | Tarjan 1 → 2, 2 ⇄ 3 · SCC 5/8 file không tách được | SCC `{1}`, `{2,3}` · warning, lát cắt không đổi |
| T-ENG-08 | `router.post('/checkout', authMiddleware, async (req,res) => {… orderService.checkout(…)})`; `checkout` gọi `productRepo.findOne/save` (repository TypeORM ngoài) | Bước 1 `ENTRY_POINT` `"router.post('/checkout')"`, khóa `…/order.routes.ts#<POST /checkout>`; bước 2 `MIDDLEWARE` `authMiddleware` kèm dòng `const JWT_SECRET` cấp module (`line_start` = dòng đó); bước 3 `OrderService.checkout` `DATA_ACCESS`; criterion = dòng `productRepo.findOne` |
| T-ENG-09 | `const t0 = Date.now()`, `logger.info(x)` (logger nội bộ) | Thành marker; không có bước logger |
| T-ENG-10 | Hàm 80 dòng, criterion dòng 50, chữ ký 1 dòng | Chữ ký + cửa sổ 26 dòng chứa dòng 50 + đóng + 2 marker = 30 |
| T-ENG-11 | 5 bước, 140 dòng, criterion ở bước 3 | Bỏ lá không bảo vệ sâu nhất trước; ≤ 100 dòng, ≤ 1500 token; còn bước 1–3 |
| T-ENG-12 | `this.svc.run()`, `svc: IOrderService` có 1 impl · 2 impl · comment `// orderItemRepo.save()` | Chuyển sang impl · 2 cạnh `ambiguous` · không cạnh |
| T-ENG-14 | A {a,s} cc 3 · B {b,s,t} cc 8 · C {c,t} cc 12 · D {d,s,t} cc 20 | `G0` A→B, B→C, A→D, B→D, C→D ⇒ A→B→C→D |
| T-ENG-15 | `G0r` A→X→C, A→B, B→C, giữ {A,B,C} · chuỗi A→B→C, giữ {A,C} | A→B, B→C (không A→C) · A→C |
| T-ENG-18 | `"Order Checkout"` + `src/routes/order.routes.ts#<POST /checkout>` · `src/algo/dijkstra.ts#findShortestRoute` | `slice-order-checkout-a6ff3b` · `algo-find-shortest-route-acfab3` |
| T-ENG-19 | 12 candidate, đường dài nhất 6 · 2 node cc 20, rank 0.6/0.7 | Giữ hết 12 (≤ CONFIG.DISPLAY_MAX_NODES), omitted_node_count = 0 · Capstone = rank 0.7 |
| T-ENG-21 | TS Na 2, Nc 3, Ce 1, Ca 1 · Na 0, Nc 2, Ce 0, Ca 3 · toàn `.js` | A 0.4, I 0.5, D 0.1 `BALANCED` · D 1 `ZONE_OF_PAIN` · miễn trừ |
| T-ENG-22 | `POST /orders/checkout` · `GET /users/:id/orders` · `POST /orders` · `GET /orders/:id` · `GET /orders` · `DELETE /orders/:id` | Order Checkout · List User Orders · Create Order · Get Order · List Orders · Delete Order |
| T-ENG-22b | `POST /orders/:id/cancel` · `POST /auth/login` · `GET /health` · `DELETE /articles/:slug/comments/:id` | Cancel Order · Login · Health · Delete Article Comment |
| T-ENG-23 | `crawler/run.py` `main()`, crawler×4, page×3 · hai "Checkout" ở `cart/`, `payment/` | "Crawler / Page" · "Checkout (cart)", "Checkout (payment)", `id` không đổi |
| T-ENG-25 | 1 file Express 5 route · `main.py` không route, 5 hàm gọi nhau | NORMAL 5 lát cắt · `PROCEDURAL` P1 |
| T-ENG-27 | `main.py` 1 hàm 400 dòng: `input()`, `if … raise`, tính, `cursor.execute` | 4 node ảo Input → Validation → Compute & Output → Data Access; id node đầu `vnode-c5e5ae` (`hash6("main.py#INPUT")`) |
| T-ENG-28 | 20 file bài tập, 0 cạnh, 0 entry, 6 hàm > 15 | NORMAL (`degraded_mode null`): 6 `algo-*` theo ENG-90, đều `prerequisites []`, không có node gom nhóm; Capstone là 1 node `algo-*` |
| T-ENG-29 | 3 câu khởi tạo, `while` 20 dòng, `return` | `ALGO_SETUP` / `ALGO_EXECUTION` / `ALGO_TERMINATION` |
| T-ENG-30 | > `CONFIG.PROCEDURAL_MAX_FILES` file, 0 entry, không hàm nào ≥ 5 | `ERR_NO_ARCHITECTURAL_SLICE` |
| T-ENG-31 | File 40% byte trong `ERROR` · mọi file như vậy | Bỏ file, `parse_error 1`, không trong `file_index` · `ERR_NO_ARCHITECTURAL_SLICE` |
| T-ENG-32 | `OrderService.checkout(userId, items)`, DTO field `qty` | Whitelist ⊇ `OrderService`, `checkout`, `OrderService.checkout`, `userId`, `items`, `qty`; sort; không `<module>` |
| T-ENG-33 | `toClientResult` | Không `symbol_whitelist`, không `suspicious_instruction_files` |
| T-ENG-34 | `runEngine` 2 lần cùng zip (X-01) | `nodes`, `edges`, `groups`, `symbol_whitelist` giống hệt khi `JSON.stringify` |
| T-ENG-35 | `mainPath`: cạnh `n-a→n-b→n-d`, `n-a→n-c→n-d` | `["n-a","n-b","n-d"]` (hòa theo `id`) |
| T-ENG-36 | 25 candidate | Giữ 20 (= CONFIG.DISPLAY_MAX_NODES), omitted_node_count = 5, warning "5 luồng khác không hiển thị trên bản đồ" |
| T-ENG-37 | Gốc A (A→B→C→D), gốc E (E→D), F không có cạnh | A, E cùng `position.y` nhỏ nhất; F ở cột bên phải mọi node Dagre; không có `__start__` |
| T-ENG-38 | Lát cắt gọi VIP `calcShipping` ở hop > `SLICE_MAX_HOPS` · VIP chỉ là callback `sort(cmp)` · không ai gọi | Có cạnh theo D-07 · đứng riêng · đứng riêng |
| T-ENG-39 | Repo Expo Router có `app/(tabs)/index.tsx` có `export default`, không có route server | File màn hình được nhận là entry `REGISTERED` (SCREEN), có node bắt đầu từ màn hình đó, archetype `MOBILE_APP` |
| T-ENG-40 | Repo Python > `CONFIG.PROCEDURAL_MAX_FILES` file, không framework, chỉ `cli.py` có `if __name__ == "__main__":` gọi hàm ở file khác | Entry `PROGRAM` (D-58, `12` Mục 2), chế độ NORMAL, có node bắt đầu từ khối `__main__` |
| T-ENG-41 | `Register` tạo `User` · `Profile` đọc `User` · `Checkout` tạo `Order`, `Order` `@ManyToOne` `User` · `Report` đọc `Order` | `Register`→`Profile`, `Register`→`Checkout` (`via_entities` `["User"]`), `Checkout`→`Report` (`["Order"]`) |
| T-ENG-42 | 7 route ở `src/` + hàm phức tạp ở `src/a.spec.ts` | Không có node từ `.spec`, Capstone ở `src/` |
| T-ENG-43 | 2 route ở `src/` + 8 route ở `integration/` | 6 node: đủ 2 route `src/`, bù 4 route `integration/`, Capstone ở `src/` |
| T-ENG-44 | 8 route, tất cả ở `integration/` | Giữ đủ 8 node |
| T-ENG-45 | `prisma.orderItem.create` · `tx.user.findMany` · `Order.create` (Mongoose) · `Repository<Order>`: `findOne` rồi `save` · `this.repo.save` trong `UserRepo` · `db.query` ở `order.service.ts` | `OrderItem` `CREATE` · `User` `READ` · `Order` `CREATE` · `Order` `READ`, `UPDATE` · `User` `CREATE` · không có thực thể |
| T-ENG-46 | Bài không có `DATA_SINK`: `POST /orders` · `POST /auth/login` · `POST /auth/register` | `Order` `CREATE` · `Auth` `READ` · `Auth` `CREATE` |
| T-ENG-47 | `E` không có bài tạo, 2 bài đụng `E` · 2 thực thể tạo cạnh ngược chiều | Nguồn là bài dễ hơn · bỏ cạnh bài khó tới bài dễ |
| T-ENG-48 | `shop-api` (`repo-demo.test.ts`) | `Create Register`→`List Profiles`→`Cart Items`→`Order Checkout`, `List Products`→`Order Checkout`→`Order Email`, `Order Checkout`→`Report Revenue`. Nhóm theo thứ tự: `Product`, `User`, `Cart` (`ROUTE_PREFIX`), `Order` (3 bài) |
| T-ENG-49 | `kuuhakubee/CNPM_BrewLite` (`apps/api`), chạy 2 lần | `Auth Register`, `List Products` là điểm bắt đầu, cùng dẫn tới `Create Order`; không có `Auth Me`→`Login`→`Register`; `List Healths` thuộc `STANDALONE`; có nhóm `ENTITY`; cùng `groups` |
| T-ENG-50 | Repo không `DATA_SINK`, không route: node thuật toán có cạnh D-56 · bài không có cạnh | Cạnh theo D-07, D-56; mọi node đúng 1 nhóm; cả 2 thuộc `STANDALONE`; bài không có cạnh không khóa |
| T-ENG-51 | Hàm `return <div/>` · chỉ callback trả JSX | Không có node · có node `algo-*` |
| T-ENG-52 | 6 route chung `shared`, `load` đọc DB | Bỏ `shared`, giữ `load` |
| T-ENG-53 | 12 API, 12 trang, 12 algo | 6 algo, đủ 12 API |
