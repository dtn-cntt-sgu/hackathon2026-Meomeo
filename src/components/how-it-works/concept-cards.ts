import type { SWESkill } from "@/contracts/base";

export interface ConceptCard {
  skill: SWESkill;
  name_vi: string;
  what: string;
  analogy: string;
  why: string;
}

export const CONCEPT_CARDS: Record<SWESkill, ConceptCard> = {
  HTTP_ROUTING: {
    skill: "HTTP_ROUTING",
    name_vi: "Định tuyến HTTP",
    what: "Ghép phương thức HTTP và đường dẫn với hàm xử lý. Ví dụ, GET /orders/42 mở đơn 42, còn DELETE trên cùng đường dẫn yêu cầu xóa đơn.",
    analogy: "Ở quầy tiếp nhận, bạn đưa địa chỉ và nói muốn nhận hay gửi bưu kiện. Hai thông tin đó quyết định quầy sẽ xử lý thế nào.",
    why: "Xác định đúng route giúp bạn tìm nơi một yêu cầu đi vào code và hiểu vì sao nó được chuyển đến hàm đó.",
  },
  DTO_VALIDATION: {
    skill: "DTO_VALIDATION",
    name_vi: "Kiểm tra dữ liệu đầu vào",
    what: "So dữ liệu gửi đến với quy tắc về trường bắt buộc, kiểu và giá trị. Đơn hàng có số lượng âm nên bị từ chối trước khi tính tiền.",
    analogy: "Nhân viên kiểm phiếu đăng ký xem đã điền đủ mục và ngày có hợp lệ trước khi nhận hồ sơ.",
    why: "Lỗi được trả về ngay tại cửa vào, trước khi dữ liệu sai đi sâu vào luồng xử lý.",
  },
  AUTH_SECURITY: {
    skill: "AUTH_SECURITY",
    name_vi: "Xác thực và phân quyền",
    what: "Xác thực kiểm tra bạn là ai. Phân quyền kiểm tra tài khoản đó được làm gì với tài nguyên đang yêu cầu.",
    analogy: "Thẻ nhân viên xác nhận danh tính, còn quyền trên thẻ quyết định bạn mở được những cửa nào.",
    why: "Người đã đăng nhập vẫn cần được kiểm quyền khi mở đơn hàng hoặc dữ liệu của người khác.",
  },
  DEPENDENCY_INJECTION: {
    skill: "DEPENDENCY_INJECTION",
    name_vi: "Truyền phụ thuộc từ bên ngoài",
    what: "Một hàm hoặc lớp nhận thứ nó cần, như bộ gửi email, qua tham số hoặc hàm khởi tạo.",
    analogy: "Thợ sửa xe dùng bộ dụng cụ do xưởng giao. Đổi bộ dụng cụ vẫn giữ được quy trình sửa xe.",
    why: "Bạn có thể truyền bộ gửi email giả khi kiểm thử, rồi dùng bộ gửi thật khi chạy ứng dụng.",
  },
  LAYERED_SEPARATION: {
    skill: "LAYERED_SEPARATION",
    name_vi: "Tách trách nhiệm theo tầng",
    what: "Chia luồng thành các phần có việc riêng. Route nhận yêu cầu, service áp dụng quy tắc nghiệp vụ, repository đọc hoặc ghi dữ liệu.",
    analogy: "Trong quán ăn, nhân viên nhận món, bếp nấu và kho quản lý nguyên liệu.",
    why: "Muốn đổi quy tắc tính giảm giá, bạn biết nên tìm ở service. Muốn sửa truy vấn, bạn tìm ở lớp dữ liệu.",
  },
  DB_OPTIMIZATION: {
    skill: "DB_OPTIMIZATION",
    name_vi: "Tối ưu truy vấn cơ sở dữ liệu",
    what: "Giảm số lần hỏi cơ sở dữ liệu hoặc lượng dữ liệu phải đọc. Chẳng hạn, lấy thông tin danh mục cho cả danh sách sản phẩm trong một truy vấn.",
    analogy: "Thay vì ra kho lấy từng món sau mỗi lần đọc danh sách, bạn gom danh sách rồi lấy các món trong một chuyến.",
    why: "Một truy vấn đặt trong vòng lặp có thể chạy hàng trăm lần khi danh sách lớn, khiến cùng một trang tải chậm dần.",
  },
  ASYNC_CONCURRENCY: {
    skill: "ASYNC_CONCURRENCY",
    name_vi: "Bất đồng bộ và xử lý đồng thời",
    what: "Trong lúc chờ một tác vụ như tải dữ liệu, chương trình có thể tiếp tục việc khác. Nhiều tác vụ đang chờ có thể hoàn thành theo thứ tự khác lúc bắt đầu.",
    analogy: "Bạn đun nước rồi rửa rau trong lúc chờ. Nước sôi trước hay rau rửa xong trước còn tùy từng lần.",
    why: "Bạn biết khi nào có thể chạy hai việc cùng lúc và khi nào phải đợi kết quả để tránh dùng dữ liệu sai.",
  },
  TRANSACTION_INTEGRITY: {
    skill: "TRANSACTION_INTEGRITY",
    name_vi: "Tính toàn vẹn giao dịch",
    what: "Gom các thay đổi liên quan vào một giao dịch để chúng cùng được ghi nhận hoặc cùng được hoàn tác.",
    analogy: "Khi chuyển tiền, trừ tiền bên gửi và cộng tiền bên nhận phải đi cùng nhau.",
    why: "Nếu một lần ghi gặp lỗi giữa chừng, dữ liệu vẫn giữ được trạng thái nhất quán.",
  },
  ERROR_HANDLING: {
    skill: "ERROR_HANDLING",
    name_vi: "Xử lý lỗi",
    what: "Nhận biết lỗi, chuyển nó thành thông báo phù hợp hoặc chuyển lên nơi có đủ thông tin để xử lý.",
    analogy: "Khi món đã hết, phục vụ báo cho khách biết để chọn món khác và ghi nhận nguyên nhân với bếp.",
    why: "Người dùng biết có thể thử lại hay cần sửa dữ liệu, còn nhóm phát triển có đủ dấu vết để tìm nguyên nhân.",
  },
  STATE_MANAGEMENT: {
    skill: "STATE_MANAGEMENT",
    name_vi: "Quản lý trạng thái",
    what: "Quy định trạng thái được lưu ở đâu, ai có quyền đổi và có thể chuyển sang trạng thái nào.",
    analogy: "Một đơn hàng đi từ chờ thanh toán sang đã thanh toán rồi mới giao. Mỗi bước có người chịu trách nhiệm cập nhật.",
    why: "Một nguồn dữ liệu rõ ràng giúp các màn hình hiển thị cùng kết quả và tránh chuyển trạng thái vô lý.",
  },
  ALGORITHMIC_COMPLEXITY: {
    skill: "ALGORITHMIC_COMPLEXITY",
    name_vi: "Độ phức tạp thuật toán",
    what: "Ước lượng số thao tác và lượng bộ nhớ tăng ra sao khi dữ liệu lớn lên.",
    analogy: "Tìm tên trên danh sách chưa sắp có thể phải đọc từng dòng. Với danh sách xếp theo tên, bạn có thể bỏ qua nửa danh sách sau mỗi lần so sánh.",
    why: "Bạn nhận ra đoạn code chạy ổn với mười mục nhưng có thể trở thành điểm nghẽn với một triệu mục.",
  },
  MEMORY_MANAGEMENT: {
    skill: "MEMORY_MANAGEMENT",
    name_vi: "Quản lý bộ nhớ và tài nguyên",
    what: "Kiểm soát lượng dữ liệu đang giữ và vòng đời tài nguyên. Ví dụ, đọc file theo từng đoạn và đóng luồng khi xong.",
    analogy: "Khi phân loại hàng, bạn đưa từng thùng lên bàn rồi dọn chỗ cho thùng kế tiếp.",
    why: "Ứng dụng có thể xử lý dữ liệu lớn mà ít gặp tình trạng hết bộ nhớ hoặc giữ kết nối lâu sau khi dùng xong.",
  },
  API_CONTRACT_DESIGN: {
    skill: "API_CONTRACT_DESIGN",
    name_vi: "Thiết kế hợp đồng API",
    what: "Thống nhất đường dẫn, dữ liệu gửi và nhận, cùng mã trạng thái cho kết quả hoặc lỗi.",
    analogy: "Mẫu đơn nói rõ người nộp cần điền mục nào và sẽ nhận lại giấy xác nhận gì.",
    why: "Frontend và backend có thể phát triển song song. Khi cần đổi tên trường, cả hai bên biết chỗ nào sẽ bị ảnh hưởng.",
  },
  CACHING_STRATEGY: {
    skill: "CACHING_STRATEGY",
    name_vi: "Chiến lược bộ nhớ đệm",
    what: "Lưu tạm kết quả hay dùng, đồng thời quy định khi nào dùng lại và khi nào phải làm mới.",
    analogy: "Quán treo bản sao thực đơn ở cửa để khách xem nhanh. Khi đổi giá, quán phải cập nhật cả bản treo.",
    why: "Cache giảm việc tính hoặc tải lại. Quy tắc làm mới giúp tránh hiển thị giá hay thông tin đã cũ.",
  },
  RATE_LIMIT_RESILIENCE: {
    skill: "RATE_LIMIT_RESILIENCE",
    name_vi: "Chịu tải và giới hạn tần suất",
    what: "Hạn chế số yêu cầu trong một khoảng thời gian, đặt thời gian chờ và giãn lần thử lại khi dịch vụ ngoài đang quá tải.",
    analogy: "Quầy đông khách phát số và hẹn lượt quay lại, để mọi người không chen vào cùng lúc.",
    why: "Khi dịch vụ chậm hoặc quá tải, ứng dụng tránh tạo thêm một đợt yêu cầu dồn dập và có thể báo lỗi sớm.",
  },
  DATA_SERIALIZATION: {
    skill: "DATA_SERIALIZATION",
    name_vi: "Chuyển đổi định dạng dữ liệu",
    what: "Chuyển dữ liệu nội bộ sang định dạng gửi qua mạng như JSON, hoặc đọc định dạng đó trở lại thành dữ liệu dùng trong code.",
    analogy: "Gửi hàng cần đóng gói và ghi nhãn theo quy ước để nơi nhận mở đúng cách.",
    why: "Hai bên hiểu cùng kiểu dữ liệu, chẳng hạn cách biểu diễn ngày, và ứng dụng kiểm soát được trường nào gửi ra ngoài.",
  },
};
