import React from "react";
import RealtimeQuestionRoom from "./components/RealtimeQuestionRoom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css'; // Import CSS
// test
function App() {
  return (
    <div>
      <RealtimeQuestionRoom />
      <ToastContainer
        position="top-right" // Vị trí
        autoClose={3000} // Tự động đóng sau 3 giây
        hideProgressBar={false}
        newestOnTop={true}
        containerStyle={{
          marginRight: '100px', // <-- Thêm margin-right ở đây
          // Bạn có thể thêm các style khác nếu cần
          top: 40, // Ví dụ: điều chỉnh khoảng cách từ top
        }}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light" // Hoặc "dark", "colored"
        // transition={Bounce} // Hiệu ứng (cần import Bounce từ thư viện)
      />
    </div>
  );
}

export default App;