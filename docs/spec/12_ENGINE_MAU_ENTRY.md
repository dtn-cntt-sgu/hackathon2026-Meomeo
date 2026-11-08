# 12 — ENGINE: BẢNG MẪU ENTRY THEO FRAMEWORK & NGÔN NGỮ

> Dữ liệu tra cứu cho `11` Mục 4 (ENG-40) và ENG-21b: mẫu đăng ký entry, entry chung, entry chương trình, cách hiểu "export". Thuật toán dùng các bảng này nằm ở `11`.
> Code: `src/server/engine/graph/callgraph.ts`, `symbols.ts`, `queries/<lang>.scm`. Kiểu: `02_CONTRACTS.md` (`LanguageAdapter.ingress_patterns`). Luật `ENG-xx` theo `11`.
> ✅ = đã kiểm chứng. Mẫu không có ✅ được đặc tả đủ để code nhưng chưa kiểm chứng (INV-09).

---

## 1. Mẫu đăng ký (ENG-40, `REGISTERED`)

Cuối = handler, trước = middleware, trừ khi ghi khác. Đối số, `path`, `display_name` theo `11` ENG-40 mục 2.

- **Express / Koa-router / Fastify ✅:** `R.<verb>(path, ...fns)` (verb: get post put patch delete all options head), `R.route(path).<verb>(...)`, `R` từ `express()`, `Router()`, `express.Router()`, `new Router()`, `fastify()` trong cùng file, hoặc `R` là tham số, import nội bộ tên `app`, `router`, `server`, `fastify`, kết thúc `Router`; `R` từ gói ngoài khác ⇒ không phải route. Cuối = handler (hàm, lời gọi bọc, tên hàm, biến gán từ lời gọi; chuỗi, số, boolean, `null`, object, mảng ⇒ không phải route), trước = middleware; `R.use(fn)` = middleware; `R.use(prefix, R2)` = tiền tố `R2`.
- **NestJS ✅:** `@Controller(prefix?)` + `@Get/@Post/@Put/@Patch/@Delete/@All(path?)`; `@UseGuards/@UseInterceptors/@UsePipes(X)` ⇒ middleware `X.canActivate|intercept|transform`.
- **Flask ✅:** `@X.route(path, methods=…)`, `@X.get/post/…`; `X = Flask()`/`Blueprint(url_prefix=)`, `register_blueprint(bp, url_prefix=)`; decorator khác (`@login_required`) = middleware.
- **FastAPI ✅:** `@X.get/post/put/patch/delete(path)`; `X = FastAPI()`/`APIRouter(prefix=)`, `include_router(r, prefix=)`; `Depends(fn)` ⇒ middleware theo thứ tự tham số.
- **Spring Boot:** lớp có `@RestController` hoặc `@Controller`; prefix = `@RequestMapping(path)` của lớp; method có `@GetMapping`, `@PostMapping`, `@PutMapping`, `@PatchMapping`, `@DeleteMapping(path?)`, hoặc `@RequestMapping(path, method = RequestMethod.X)`. Không có `method` ⇒ `ALL`. Đường dẫn lấy từ đối số đầu hoặc `value`, `path`; mảng ⇒ phần tử đầu. Không có middleware. Luật riêng: Mục 4.
- **Khác:** Next.js `pages/api/**`, `app/**/route.ts` (HTTP), `app/**/page.tsx` (PAGE); React Router `<Route element|component>` (PAGE); React Native `<X.Screen component|getComponent>`, `X` từ `create*Navigator()` (Stack, Tab, Drawer…; SCREEN, path = `name`); Expo Router (gói `expo-router`): file `app/**` có `export default`, trừ `_layout`, `+*`, bỏ `(nhóm)` khỏi path (SCREEN); Commander `.command(n).action(fn)` (COMMAND); Django `path(route, view)`; Typer/Click `@*.command()` (COMMAND); Spring `@RestController` + `@*Mapping`; Go `http.HandleFunc`, gin `r.GET(p, mw…, h)`, echo `e.GET(p, h, mw…)` (handler đầu); Flutter `GoRoute`, `routes: {'/p': (_) => W()}` / `home: W()` của `MaterialApp`/`CupertinoApp`, `MaterialPageRoute`/`CupertinoPageRoute(builder: … W())`, con của `TabBarView`/`IndexedStack` ⇒ `W.build` (SCREEN).
- **Android, iOS (D-57):** lớp con `Activity`/`AppCompatActivity`/`ComponentActivity`/`FragmentActivity` ⇒ `onCreate`; lớp con `Fragment` ⇒ `onCreateView` (thiếu ⇒ `onViewCreated`); `composable(route) { X() }` trong `NavHost` ⇒ `X`, path = `route`; lớp con `UIViewController`/`UITableViewController`/`UICollectionViewController` ⇒ `viewDidLoad` (thiếu ⇒ `loadView`); view SwiftUI `X` là đích `NavigationLink`/`.navigationDestination`/`.sheet`, con trực tiếp của `TabView`/`WindowGroup` ⇒ `X.body`. Đều SCREEN.

Kiểu app mobile ít phổ biến (Ionic/Capacitor, .NET MAUI/Xamarin, NativeScript, Kotlin Multiplatform, router tự viết) không có mẫu; để lộ trình (D-57, `pitch/ROADMAP`).

---

## 2. Entry chung và entry chương trình (D-58)

1. **Entry chung (`GENERIC`)** — segment thư mục hoặc token cuối stem của file ∈ {controller(s), route(s), router(s), handler(s), api, endpoint(s), screen(s), page(s), view(s), activity, activities, fragment(s), command(s)}. Điều kiện còn lại ở `11` ENG-40 mục 3.
2. **Entry chương trình (`PROGRAM`)** — hàm `main` (C# `Main`) có thân, cấp file hoặc method static, ở mọi ngôn ngữ `RESOLVED`/`STRUCTURAL` (Go chỉ `package main`); Swift kiểu `@main` ⇒ `main()` (SwiftUI `App` ⇒ `body`); `<module>` của: `main.swift`, Scala `object … extends App`, Python có `if __name__ == "__main__"`, Ruby có `if __FILE__ == $0`, PHP `index.php` ở gốc scope hoặc `public/`, `package_entry_files`. Chỉ dùng ở dòng 3 của ENG-51 (`11` Mục 5).

---

## 3. `is_exported` (ENG-21b)

Ngôn ngữ không có từ khóa `export` vẫn có quy ước "công khai"; engine dùng quy ước đó:

TS/JS `export`, `module.exports`, `exports.x`; Python, Dart tên không mở đầu `_`; Go chữ đầu viết hoa; Rust `pub`; C/C++ hàm cấp file không `static`, method `public`; Java, C#, Kotlin, Scala, Swift, PHP, Ruby không `private`/`protected`/`internal`/`fileprivate`; ngôn ngữ khác ⇒ mọi hàm cấp file và method.

---

## 4. Spring Boot: tầng và dữ liệu

1. **ENT-40 Tầng** (thêm vào ENG-82, xét sau entry, middleware). Lớp có `@Repository` hoặc lớp, interface kế thừa `JpaRepository`, `CrudRepository`, `PagingAndSortingRepository`, `ListCrudRepository`, `Repository` ⇒ `DATA_ACCESS`. Lớp có `@Service` hoặc `@Component` ⇒ `BUSINESS_LOGIC`, trừ khi luật `DATA_SINK` của ENG-82 cho `DATA_ACCESS`.
2. **ENT-41 `DATA_SINK` theo kiểu** (thêm vào `11` Mục 8). Lấy kiểu của receiver từ `FieldTypeMap`, không xét tên receiver:
   - Kiểu là interface kế thừa danh sách ở ENT-40 ⇒ mọi lời gọi method là `DATA_SINK`.
   - Kiểu là `EntityManager`, method ∈ {persist, merge, remove, find, createQuery, createNativeQuery} ⇒ `DATA_SINK`.
   - `T` của ENG-116 lấy từ tham số kiểu đầu của lớp cha trong danh sách ENT-40.
3. **ENT-42 Interface không có thân.** Method của interface Repository không là bước (ENG-80 chỉ lấy hàm có thân). Lời gọi tới nó là `ExternalCall`.
4. **ENT-43 Tiêm phụ thuộc.** Cạnh gọi `controller → service → repository` đi qua `FieldTypeMap` (ENG-22). Field kiểu interface có đúng 1 lớp cài đặt trong `InterfaceImplMap` ⇒ `RESOLVED`; nhiều lớp ⇒ `INFERRED`, `ambiguous`.
5. **ENT-44 File test.** `src/test/**` mang cờ test (ING-87), không tạo node.

---

## Test bắt buộc

| ID | Input | Kỳ vọng |
| :-- | :-- | :-- |
| T-ENT-01 | `Tab.Screen` · `app/(tabs)/settings.tsx` · `routes: {'/cart': (_) => CartPage()}` · `MainActivity : ComponentActivity()` · `LoginVC: UIViewController` | SCREEN: component · `/settings` · `CartPage.build` · `onCreate` · `viewDidLoad` |
| T-ENT-02 | Repo C lớn, `int main`, 0 route · `Controllers/OrderController.cs` · Python `_helper`, Go `helper` | `PROGRAM` ⇒ có lát cắt · `GENERIC` · không export |
| T-ENT-03 | `config.get('K', '7d')` · `cache.get('k', loadFn)` · `http.get(url, fn)` import từ `msw` · `const h = makeHandler(cfg); router.get('/x', h)` · `function reg(app) { app.get('/x', h) }` | Không route · không route · không route · có route · có route |
| T-ENT-04 | `@RestController @RequestMapping("/owners")` + `@GetMapping("/{id}")` · `@RequestMapping(value = "/x", method = RequestMethod.POST)` · `@RequestMapping("/y")` không có `method` | `GET /owners/{id}` · `POST /x` · `ALL /y` |
| T-ENT-05 | `private final OwnerRepository owners;` với `OwnerRepository extends JpaRepository<Owner, Integer>`, gọi `owners.findById(1)` · `entityManager.persist(o)` · `orderService.findById(1)` với `OrderService` không phải Repository | 2 `DATA_SINK` đầu, thực thể `Owner` ở ca 1 · ca 3 không phải `DATA_SINK` |
| T-ENT-06 | Controller gọi Service gọi Repository · field kiểu interface 1 lớp cài đặt · 2 lớp cài đặt · `src/test/java/XTest.java` có `@GetMapping` | Lát cắt đi đủ 3 tầng, bước cuối `DATA_ACCESS` hoặc có `DATA_SINK` · `RESOLVED` · `INFERRED` · không có node |
