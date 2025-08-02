# TouchMe

**TouchMe** là một web app giải trí tương tác, nơi người dùng có thể tham gia vào phòng chơi cùng bạn bè, chọn ngẫu nhiên các câu hỏi thuộc nhiều chủ đề và mức độ thân thiết khác nhau để thảo luận, giao lưu và kết nối.

## 🚀 Tính năng

- Tạo và tham gia phòng chơi bằng mã phòng.
- Đồng bộ màn hình giữa các người chơi trong cùng phòng.
- Thư viện câu hỏi đa dạng: theo chủ đề và mức độ quan hệ (bạn bè, mập mờ, người yêu).
- Câu hỏi được chia theo các vòng chơi.
- Random câu hỏi và hiển thị cho cả nhóm cùng lúc.
- Giao diện đơn giản, dễ sử dụng.

## 🧠 Công nghệ sử dụng

### Frontend
- ReactJS + Vite
- TailwindCSS
- Socket.IO (client)
- Firebase Auth

### Backend
- Node.js + Express
- Socket.IO (server)
- Firebase Firestore (lưu trữ dữ liệu)
- Firebase Storage (hình ảnh)
- Telegram Bot API (chức năng “Gọi Thổ Địa”)

## 🔧 Cài đặt và chạy ứng dụng

### Yêu cầu
- Node.js >= 16
- Có tài khoản Firebase Project (Auth, Firestore, Storage)
- Có Telegram Bot Token (nếu sử dụng chức năng gọi trợ giúp)

### Các bước cài đặt

1. **Clone dự án:**

    ```bash
    git clone https://github.com/haovu429/touchme.git
    cd touchme
    ```

2. **Cài đặt dependencies:**

    - **Backend:**

      ```bash
      cd backend
      npm install
      ```

    - **Frontend:**

      ```bash
      cd ../frontend
      npm install
      ```

3. **Thiết lập biến môi trường:**

    Tạo file `.env` trong cả thư mục `frontend/` và `backend/` với nội dung tương ứng:

    - **Frontend (`frontend/.env`):**
      ```env
      VITE_FIREBASE_API_KEY=your_firebase_api_key
      VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
      VITE_FIREBASE_PROJECT_ID=your_project_id
      VITE_SOCKET_SERVER_URL=http://localhost:5000
      ```

    - **Backend (`backend/.env`):**
      ```env
      PORT=5000
      TELEGRAM_BOT_TOKEN=your_telegram_bot_token
      FIREBASE_PROJECT_ID=your_project_id
      ```

4. **Chạy ứng dụng:**

    - **Chạy backend:**
      ```bash
      cd backend
      npm run dev
      ```
    - **Chạy frontend (mở terminal mới):**
      ```bash
      cd frontend
      npm run dev
      ```

5. **Truy cập ứng dụng:**  
   Mở trình duyệt và truy cập địa chỉ `http://localhost:5173`

---

## 📷 Demo giao diện

> *(Chèn ảnh minh họa hoặc gif tại đây nếu có)*

---

## 🧩 Gợi ý phát triển thêm

- Lịch sử câu hỏi đã trả lời.
- Tùy biến bộ câu hỏi khi tạo phòng.
- Hệ thống điểm hoặc thử thách.
- Chat trong phòng.
- Giao diện mobile thân thiện hơn.

---

## 🤝 Đóng góp

Mọi đóng góp đều được hoan nghênh!

1. Fork repository
2. Tạo branch mới:

    ```bash
    git checkout -b feature/ten-chuc-nang
    ```

3. Commit thay đổi:

    ```bash
    git commit -m "Thêm tính năng ..."
    ```

4. Push lên nhánh của bạn:

    ```bash
    git push origin feature/ten-chuc-nang
    ```

5. Mở pull request

---

## 📄 Giấy phép

Dự án được phát hành dưới giấy phép MIT. Xem chi tiết tại [LICENSE](./LICENSE).
