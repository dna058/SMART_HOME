# My Smart Home - Kobe IoT Platform

## 🌐 Giới thiệu dự án
Dự án **My Smart Home** là một nền tảng quản lý và phân tích dữ liệu IoT (Smart Home / Smart City) hiện đại. Hệ thống cho phép người dùng giám sát, điều khiển các thiết bị trong nhà theo thời gian thực, đồng thời cung cấp các công cụ quản lý bảo trì cho quản trị viên.

Dự án được xây dựng theo định hướng phát triển phần mềm hướng dịch vụ (Service-Oriented Architecture - SOA), tận dụng sức mạnh của các dịch vụ đám mây để đảm bảo tính mở rộng và khả năng tích hợp linh hoạt.

---

## 🏗️ Kiến trúc & Công nghệ
Hệ thống được thiết kế dựa trên mô hình phân lớp và tích hợp các dịch vụ bên thứ ba:

*   **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+).
*   **Backend as a Service:** [Google Firebase](https://firebase.google.com/)
    *   **Firestore:** Cơ sở dữ liệu NoSQL lưu trữ dữ liệu thời gian thực.
    *   **Authentication:** Quản lý đăng nhập và xác thực người dùng.
*   **Tích hợp đề xuất (SOA/Microservices):**
    *   **ESB / Integration:** Định hướng sử dụng WSO2 / Kafka để đồng bộ dữ liệu.
    *   **Microservices:** Node.js / Spring Boot cho các xử lý nghiệp vụ phức tạp.
    *   **Deployment:** Docker & Kubernetes (định hướng triển khai).

---

## ✨ Tính năng chính

### Đối với Người dùng (User)
*   **Quản lý nhà:** Thêm mới, chỉnh sửa hoặc xóa các ngôi nhà. Lựa chọn nhà để quản lý qua mã bảo mật.
*   **Điều khiển thiết bị:** Bật/tắt các thiết bị điện tử (đèn, quạt, điều hòa...) trực tiếp từ Dashboard.
*   **Quản lý khu vực:** Phân loại thiết bị theo phòng (Phòng khách, Phòng ngủ, Nhà bếp...).
*   **Hồ sơ cá nhân:** Cập nhật thông tin cá nhân và thay đổi mật khẩu một cách an toàn.
*   **Thông báo:** Nhận thông báo tức thì khi có thay đổi trạng thái thiết bị hoặc yêu cầu bảo trì.

### Đối với Quản trị viên (Admin)
*   **Giám sát hệ thống:** Xem trạng thái hoạt động của toàn bộ thiết bị trong nhà (chỉ xem, không có quyền điều khiển để đảm bảo tính riêng tư).
*   **Quản lý thành viên:** Xem danh sách các thành viên đang cùng sử dụng trong một ngôi nhà.
*   **Bảo trì & Sửa chữa:** Hệ thống tự động cảnh báo sự cố. Admin có quyền thực hiện các thao tác sửa chữa, bảo trì thiết bị và cập nhật trạng thái hệ thống.
*   **Giao tiếp hai chiều:** Nhận thông báo khi User thực hiện thay đổi và gửi phản hồi bảo trì cho User.

---

## 📁 Cấu trúc thư mục
```text
SMARTHOME_KOBE/
├── html/           # Chứa các giao diện trang web (Dashboard, Login, Management...)
├── css/            # Các file định dạng phong cách giao diện
├── js/             # Logic xử lý JavaScript và tích hợp Firebase
├── images/         # Tài nguyên hình ảnh, icon
└── readme.md       # Tài liệu dự án
```

---

## 🚀 Hướng dẫn cài đặt & Chạy thử

### 1. Yêu cầu hệ thống
*   Trình duyệt web hiện đại (Chrome, Edge, Firefox).
*   Kết nối Internet để truy cập dữ liệu từ Firebase.

### 2. Cách khởi động
*   Mở file `html/login.html` bằng trình duyệt hoặc sử dụng Live Server (trong VS Code) để bắt đầu.

### 3. Tài khoản thử nghiệm
Hệ thống đã được thiết lập sẵn hai vai trò để kiểm thử:

| Vai trò | Email | Mật khẩu (Mặc định) |
| :--- | :--- | :--- |
| **USER** | `nhatanh@gmail.com` | *(Tài khoản đã tạo sẵn)* |
| **ADMIN** | `dao@gmail.com` | *(Tài khoản đã tạo sẵn)* |

---

## 📅 Quy trình phát triển (7 bước)
Dự án tuân thủ nghiêm ngặt quy trình phát triển phần mềm chuẩn:
1.  **Phân tích:** Xác định yêu cầu người dùng và các dịch vụ IoT cần thiết.
2.  **Thiết kế:** Vẽ sơ đồ kiến trúc SOA/Microservices và Database.
3.  **Triển khai:** Xây dựng giao diện và cấu trúc dữ liệu trên Firestore.
4.  **Tích hợp:** Kết nối Frontend với các API Firebase và hệ thống thông báo.
5.  **Kiểm thử:** Đảm bảo tính đúng đắn của logic điều khiển và phân quyền.
6.  **Gỡ lỗi:** Tối ưu hóa hiệu năng và sửa lỗi phát sinh.
7.  **Vận hành:** Triển khai phiên bản ổn định cho người dùng.

---
**Nhóm thực hiện:** Nhóm 3 - Nền tảng Quản lý & Phân tích dữ liệu IoT.
