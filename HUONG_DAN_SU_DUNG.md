# Hướng dẫn sử dụng CogniMail (cho người không biết code)

Tài liệu này hướng dẫn từ A đến Z: cài đặt, sử dụng, cập nhật giao diện (UI), và cập nhật lên server.

Ghi chú:
- CogniMail gồm 2 phần: Web (frontend) và Worker cục bộ (ứng dụng Windows chạy nền để đọc email qua IMAP).
- Bạn có thể dùng CogniMail chỉ với Web, nhưng muốn đồng bộ IMAP ổn định và dùng OAuth OpenAI qua worker thì nên cài Worker.

---

## 1) Chuẩn bị

### 1.1 Yêu cầu tối thiểu (người dùng cuối)
- Windows 10/11.
- Kết nối Internet.
- Tài khoản email có hỗ trợ IMAP (Gmail/Outlook/Email công ty).
- Nếu dùng Gmail: bật IMAP trong Gmail Settings.

### 1.2 Thông tin bạn cần có trước khi cấu hình IMAP
- IMAP host (ví dụ: `imap.gmail.com`)
- IMAP port (thường `993`)
- Username (email đăng nhập)
- Password (hoặc App Password nếu nhà cung cấp yêu cầu)
- Mailbox (thường `INBOX`)

---

## 2) Cài Worker (Windows)

### 2.1 Tải Worker
Trên web CogniMail, vào:
- `Cài đặt` -> `Tải Worker local`

Nếu bạn có link trực tiếp:
- `downloads/CogniMailWorkerSetup-latest.msi` (luôn là bản mới nhất)
- `downloads/CogniMailWorkerSetup-vX.Y.Z.msi` (bản theo version)

### 2.2 Cài đặt
1. Mở file `.msi` vừa tải.
2. Next -> Install.
3. Sau khi cài xong, mở ứng dụng `CogniMail Worker` (hoặc `WorkerTray`).

### 2.3 Worker chạy ở đâu?
Worker chạy dạng tray (biểu tượng dưới khay hệ thống).

Các cổng (port) thường gặp:
- Local worker API: `127.0.0.1:41731`
- OAuth callback local (OpenAI): `127.0.0.1:1455`

Nếu bị xung đột port (đã có app khác dùng), cần đổi port trong cấu hình worker (phần Troubleshooting ở cuối).

---

## 3) Sử dụng Web CogniMail (người dùng cuối)

### 3.1 Đăng nhập
1. Mở trang web CogniMail.
2. Đăng ký hoặc đăng nhập bằng email/mật khẩu.

### 3.2 Cấu hình IMAP
Vào:
- `Cài đặt` -> phần `IMAP`

Nhập:
- Host, Port, Secure, Username, Password, Mailbox

Sau đó bấm:
- `Test IMAP` để kiểm tra kết nối.

### 3.3 Đồng bộ email
Bạn có 2 cách (tùy cấu hình dự án):
- Cách A: Đồng bộ qua backend API (server).
- Cách B (khuyến nghị): Đồng bộ qua Worker cục bộ (agent local).

Nếu dùng Worker:
1. Mở Worker tray và đảm bảo trạng thái `Đang chạy`.
2. Trên Web: `Cài đặt` -> `Agent cục bộ`
3. Bấm `Kết nối Agent local` (hoặc `Kiểm tra Agent`)
4. Chạy đồng bộ (`Sync now`) hoặc fetch email từ sidebar.

### 3.4 Xem email theo “Thư gốc” và “Thư phản hồi”
Trong trang Email có 2 chế độ:
- `Thư gốc`: hiển thị từng email riêng lẻ.
- `Thư phản hồi`: gom email theo hội thoại (dựa trên subject).

Lưu ý quan trọng:
- Dù bạn đang xem “Thư gốc” hay “Thư phản hồi”, khi bấm chạy AI thì hệ thống vẫn gửi email theo dạng hội thoại để AI dễ hiểu ngữ cảnh (gom theo subject).

### 3.5 Chạy AI để tóm tắt và trích xuất task/deadline
1. Chọn email (tích checkbox) hoặc không chọn để hệ thống lấy mặc định email gần nhất.
2. Bấm nút `AI`.
3. Ở `Prompt custom`, nếu bạn nhập thì nó sẽ ưu tiên hơn prompt khuyến nghị.
4. Bấm `Chạy AI`.

Kết quả thường gồm:
- Tóm tắt ngữ cảnh
- Danh sách task
- Nếu có deadline, task được gắn tag `deadline`
- Có `evidence` để bạn biết task đó dựa trên câu nào trong email

---

## 4) Cập nhật UI (người vận hành, không cần giỏi code)

Mục tiêu: sửa giao diện web (UI) rồi cập nhật lên server.

### 4.1 Các file UI chính (để tìm đúng chỗ sửa)
- Trang chính: `apps/frontend/app/page.tsx`
- Trang email: `apps/frontend/components/EmailPage.tsx`
- Danh sách email: `apps/frontend/components/EmailList.tsx`
- Chi tiết email: `apps/frontend/components/EmailDetail.tsx`
- Cài đặt: `apps/frontend/components/SettingsPage.tsx`
- Khu AI: `apps/frontend/components/AIPanel.tsx`

### 4.2 Quy trình sửa UI an toàn
1. Sửa đúng file UI cần thiết.
2. Build frontend để kiểm tra lỗi.
3. Deploy lên Firebase Hosting.

---

## 5) Update lên server (deploy frontend)

### 5.1 Build frontend
Chạy ở thư mục repo:
- Build: `apps/frontend` xuất ra `apps/frontend/out`

Lệnh chuẩn:
- `npm --prefix apps/frontend run build`

### 5.2 Deploy lên Firebase Hosting
Chạy:
- `firebase deploy --only hosting`

Ghi chú:
- Dự án dùng cấu hình Firebase trong `firebase.json` và `.firebaserc`.
- Thư mục deploy là `apps/frontend/out`.

---

## 6) Build và phát hành Worker MSI (dành cho người vận hành)

### 6.1 Build MSI
Script build MSI:
- `apps/backend-worker/scripts/build-msi.ps1`

Set version trước khi build (ví dụ):
- `MSI_VERSION=1.26.81`

Kết quả MSI tạo ở:
- `apps/backend-worker/release/`

### 6.2 Đưa MSI lên web để người dùng tải
Copy MSI vào:
- `apps/frontend/public/downloads/`

Thường sẽ có 3 tên:
- `CogniMailWorkerSetup-latest.msi` (bản mới nhất)
- `CogniMailWorkerSetup-vX.Y.Z.msi` (bản version)
- `CogniMailWorkerSetup-v1.msi` (alias tương thích)

Sau đó build frontend và deploy hosting để public link tải.

---

## 7) Troubleshooting (lỗi hay gặp)

### 7.1 Worker báo “Đang chờ worker phản hồi... Timeout /status”
Nguyên nhân thường gặp:
- Worker đã tắt/crash.
- Bị Windows Firewall chặn.
- Port local worker bị xung đột.

Cách xử lý:
1. Mở lại Worker tray.
2. Kiểm tra Worker có đang chạy không.
3. Tắt/bật lại Worker.
4. Nếu vẫn lỗi: đổi port worker (cần người vận hành chỉnh cấu hình worker hoặc build lại).

### 7.2 OAuth callback trả về `http://localhost:1455/auth/callback?...` rồi lỗi
Nguyên nhân thường gặp:
- Port `1455` bị app khác chiếm.
- Worker không còn lắng nghe callback.

Cách xử lý:
1. Tắt app đang chiếm `1455` (nếu có).
2. Hoặc đổi OAuth callback port trong worker (cần người vận hành).

### 7.3 AI có vẻ “không đọc hết email”
Thực tế:
- Hệ thống gửi email theo block hội thoại và có chỉ dẫn “đọc từ đầu đến cuối”.
- Tuy nhiên model vẫn có thể bỏ sót nếu email quá dài hoặc prompt quá lỏng.

Cách cải thiện (người vận hành):
- Giữ prompt ngắn nhưng rõ: “đọc toàn bộ nội dung tôi gửi, không được lười”.
- Tăng chất lượng nội dung gửi: hạn chế rác chữ ký/quote nếu không cần.

---

## 8) Tài liệu liên quan

Nếu cần sửa/đổi cấu hình sâu (backend/worker/port), xem thêm:
- `DEPLOY_CHECKLIST.md`
- `SETUP_NEW_MACHINE.md`