# YouTube Scheduler Desktop Application

Ứng dụng Desktop (Electron + React + Express) chuyên biệt cho việc **Quản lý kênh và Lên lịch tự động công chiếu video YouTube**.

## 🚀 Tính năng chính
1. **Quản lý kênh YouTube (Multi-channel)**:
   - Kết nối không giới hạn tài khoản/kênh YouTube qua Google OAuth2.
   - Tự động lưu và refresh token.
   - Kiểm tra tình trạng hoạt động của token từng kênh.
2. **Chỉnh sửa Tiêu đề & Thumbnail hàng loạt**:
   - Tải danh sách video riêng tư (Private) trực tiếp từ kênh.
   - Nhập tiêu đề từ file TXT theo số thứ tự (STT 1., 2., ...).
   - Nhập ảnh thumbnail từ thư mục ảnh theo STT (1.png, 2.jpg, ...).
   - Tùy chọn gắn nhãn nội dung do AI tạo (Synthetic Media).
   - Cập nhật metadata và upload ảnh thumbnail đồng thời lên YouTube.
3. **Lên lịch công chiếu tự động (Publishing Schedule)**:
   - Chọn ngày bắt đầu và các khung giờ công chiếu (Time Slots).
   - Hỗ trợ 2 chế độ: Phân bổ nhiều video theo khung giờ trong ngày hoặc Mỗi ngày 1 video.
   - Đặt lịch trực tiếp lên YouTube Data API v3 (`status.publishAt`).
   - Thanh tiến trình trực quan, báo cáo trạng thái thành công/thất bại chi tiết.
4. **Cài đặt Google OAuth linh hoạt**:
   - Dễ dàng thay đổi Google Client ID và Secret trực tiếp trên giao diện Desktop.

---

## 🛠 Hướng dẫn phát triển (Development)

1. Cài đặt thư viện:
```bash
npm install
```

2. Chạy ứng dụng ở chế độ lập trình (Dev Mode):
```bash
npm run dev
```
*(Lệnh này sẽ tự động khởi chạy Backend Express, Vite Dev Server và Electron)*

---

## 📦 Hướng dẫn đóng gói ứng dụng Desktop (Build & Package)

### 1. Build ứng dụng:
```bash
npm run build
```

### 2. Đóng gói bộ cài đặt:
- **macOS** (File `.dmg` và `.zip`):
```bash
npm run package:mac
```
- **Windows** (File `.exe` NSIS và Portable):
```bash
npm run package:win
```

File cài đặt xuất xưởng sẽ nằm trong thư mục `release/`.
