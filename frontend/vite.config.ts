import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    // Đảm bảo bạn có dòng này để chạy đúng trên Heroku
    host: '0.0.0.0',
    // Thêm hoặc chỉnh sửa phần này:
    allowedHosts: [
      'touchme-frontend-aba69e9a1bd9.herokuapp.com',
      // Bạn có thể muốn giữ lại localhost để phát triển cục bộ
      'localhost',
      '127.0.0.1',
    ],
    // Cổng (port) thường Vite sẽ tự nhận từ $PORT của Heroku
    // port: process.env.PORT
  },
  build: {
    // Kiểm tra dòng này:
    outDir: 'dist' // Ví dụ: Nếu đặt là 'build' thay vì 'dist'
    // Hoặc tệ hơn:
    // outDir: '.' // Nếu đặt là '.', nó sẽ build ra thư mục gốc hiện tại!
  }
})