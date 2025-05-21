// touchme/frontend/src/components/RealtimeQuestionRoom.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { toast } from "react-toastify";
import SystemChatMessage from "./SystemChatMessage";
import QRCode from "react-qr-code"; // <--- Import thư viện QR Code
import CallAdminDialog from "./CallAdminDialog";
import axios from "axios";
import {
  CLOUDINARY_API_URL,
  CLOUDINARY_UPLOAD_PRESET,
} from "../cloudinaryConfig";
import ChatMessage from "./ChatMessage";

const socket = io(import.meta.env.VITE_SOCKET_URL, {
  transports: ["websocket", "polling"], // Ưu tiên websocket
}); // Kết nối tới backend

export default function RealtimeQuestionRoom() {
  const [roomCode, setRoomCode] = useState("");
  const [username, setUsername] = useState(""); // State cho tên người dùng
  const [joined, setJoined] = useState(false);
  const [question, setQuestion] = useState(null); // Lưu nội dung câu hỏi (string)
  const [level, setLevel] = useState("level1");
  const [userCount, setUserCount] = useState(0);

  // --- State cho Chat ---
  const [messages, setMessages] = useState([]); // Mảng lưu tin nhắn { id, text, senderName, timestamp }
  const [newMessage, setNewMessage] = useState(""); // Nội dung tin nhắn đang gõ
  const chatDisplayRef = useRef(null); // Ref để tự cuộn chat
  const [showQrCode, setShowQrCode] = useState(false); // <-- State để ẩn/hiện QR
  const [canCallAdmin, setCanCallAdmin] = useState(true); // Mặc định là có thể gọi
  const [isAdminCallPending, setIsAdminCallPending] = useState(false); // Giữ nguyên state này
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const handleOpenImage = (url) => {
    setPreviewImage(url);
  };

  const handleCloseImage = () => {
    setPreviewImage(null);
  };

  // --- useEffect để đọc roomCode từ URL khi component mount ---
  useEffect(() => {
    const cached = localStorage.getItem("touchme-room");
    if (cached) {
      try {
        const { roomCode, username, level } = JSON.parse(cached);
        if (roomCode && username && level) {
          // toast.info("Khôi phục phòng từ cache...");
          setRoomCode(roomCode);
          setUsername(username);
          setLevel(level);
          socket.emit("join-room", roomCode, username, level);
          setJoined(true);
        }
      } catch (e) {
        console.error("Không thể parse cache room:", e);
      }
    }

    const queryParams = new URLSearchParams(window.location.search);
    const roomFromUrl = queryParams.get("room");
    if (roomFromUrl && roomFromUrl.length <= 6) {
      const sanitizedRoomCode = roomFromUrl
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      setRoomCode(sanitizedRoomCode);
      toast.info(`Mã phòng ${sanitizedRoomCode} đã được nhập sẵn từ link mời.`);
      // Xóa query param khỏi URL để tránh lỗi khi refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []); // Chạy 1 lần khi mount

  // Hàm tự cuộn xuống cuối chat
  const scrollToBottom = useCallback(() => {
    if (chatDisplayRef.current) {
      // Thêm độ trễ nhỏ để DOM kịp cập nhật trước khi cuộn
      setTimeout(() => {
        if (chatDisplayRef.current) {
          chatDisplayRef.current.scrollTop =
            chatDisplayRef.current.scrollHeight;
        }
      }, 50);
    }
  }, []);

  const handleCallAdmin = () => {
    if (roomCode && !isAdminCallPending) {
      setShowCallDialog(true); // Hiện form nhập
    }
  };

  const submitCallAdminMessage = (userMessage) => {
    setIsAdminCallPending(true);
    socket.emit("call-admin", { roomCode, message: userMessage });
    setShowCallDialog(false);

    // Timeout fallback
    setTimeout(() => setIsAdminCallPending(false), 30000);
  };

  // Tự cuộn khi có tin nhắn mới hoặc load lịch sử
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Hàm join phòng (Sửa để gửi username và level)
  const joinRoom = () => {
    const finalUsername =
      username.trim() || `User_${Math.random().toString(36).substring(2, 6)}`; // Username hoặc tên ngẫu nhiên
    const finalRoomCode = roomCode.trim().toUpperCase(); // Luôn viết hoa mã phòng
    if (finalRoomCode && finalRoomCode.length <= 6) {
      // Thêm kiểm tra độ dài nếu cần
      setRoomCode(finalRoomCode); // Cập nhật lại state nếu có trim/uppercase
      setUsername(finalUsername); // Cập nhật lại state username
      socket.emit("join-room", finalRoomCode, finalUsername, level); // Gửi cả 3
      setJoined(true);
      localStorage.setItem(
        "touchme-room",
        JSON.stringify({
          roomCode: finalRoomCode,
          username: finalUsername,
          level,
        })
      );
    } else {
      toast.error("Vui lòng nhập mã phòng hợp lệ (tối đa 6 ký tự).");
    }
  };

  // Hàm random câu hỏi (Giữ nguyên)
  const randomQuestion = () => {
    if (roomCode) {
      socket.emit("get-question", { roomCode, level });
    }
  };

  // Hàm thoát phòng (Sửa lại)
  const quitRoom = () => {
    if (roomCode) {
      socket.emit("leave-room", roomCode); // Chỉ gửi roomCode string
    }
    // Reset state về ban đầu
    setJoined(false);
    setRoomCode("");
    setUsername("");
    setQuestion(null);
    setLevel("level1");
    setUserCount(0);
    setMessages([]);
    // Không cần reload trang
    // toast.info(`Bạn đã rời phòng!`); // Có thể thêm toast nếu muốn

    localStorage.removeItem("touchme-room");
  };

  // Hàm gửi tin nhắn
  const sendMessage = (e) => {
    e.preventDefault(); // Ngăn form submit reload
    const trimmedMessage = newMessage.trim();
    if (trimmedMessage && roomCode && joined) {
      // Chỉ gửi khi đã join và có tin nhắn
      socket.emit("send-message", { roomCode, message: trimmedMessage });
      setNewMessage(""); // Xóa input
    }
  };

  // const handleImageUpload = async (e) => {
  //   const file = e.target.files[0];
  //   if (!file) return;

  //   if (!roomCode || !joined) {
  //     toast.error("Bạn phải vào phòng trước khi gửi ảnh.");
  //     return;
  //   }

  //   const formData = new FormData();
  //   formData.append("file", file);
  //   formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  //   try {
  //     toast.info("Đang tải ảnh...");
  //     const res = await axios.post(CLOUDINARY_API_URL, formData);
  //     const imageUrl = res.data.secure_url;

  //     socket.emit("send-message", {
  //       roomCode,
  //       imageUrl,
  //     });

  //     toast.success("Đã gửi ảnh!");
  //   } catch (err) {
  //     console.error("Upload error:", err);
  //     toast.error("Không thể gửi ảnh.");
  //   }
  // };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    try {
      toast.info("Đang tải ảnh lên server...");
      const res = await axios.post(
        `${import.meta.env.VITE_SOCKET_URL}/upload-image`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const imageUrl = res.data.imageUrl;
      socket.emit("send-message", { roomCode, imageUrl });

      toast.success("Đã gửi ảnh!");
    } catch (err) {
      console.error("Lỗi gửi ảnh:", err);
      toast.error("Không thể gửi ảnh.");
    }
  };

  // Lắng nghe sự kiện từ server
  useEffect(() => {
    // --- Xử lý kết nối lại và tự động join lại ---
    const handleConnect = () => {
      console.log("Reconnected with ID:", socket.id);
      if (joined && roomCode && username) {
        // Chỉ rejoin nếu trước đó đã ở trong phòng
        console.log(`Attempting to rejoin room ${roomCode} as ${username}`);
        socket.emit("join-room", roomCode, username, level); // Gửi lại đầy đủ thông tin
        // toast.info("Đã kết nối lại!");
      } else {
        console.log("Connected with ID:", socket.id);
      }
    };
    socket.on("connect", handleConnect);

    // Lắng nghe câu hỏi mới
    // Backend gửi cả object, ta lấy content
    socket.on("new-question", (q) => {
      setQuestion(q?.content);
    });

    // Lắng nghe user join
    socket.on("user-joined", (data) => {
      setUserCount(data.userCount);
      toast.info(`${data.username || "Someone"} has joined! 👋`);
    });

    // Lắng nghe user left
    socket.on("user-left", (data) => {
      setUserCount(data.userCount);
      toast.warn(`${data.username || "Someone"} has left.`);
    });

    // Lắng nghe khi join phòng thành công (nhận cả lịch sử chat)
    socket.on("room-joined", (data) => {
      toast.success(`Đã vào phòng ${data.roomCode}. (${data.userCount} người)`);
      setQuestion(data.question?.content); // Lấy content câu hỏi ban đầu
      setUserCount(data.userCount);
      setMessages(data.chatHistory || []); // Nhận lịch sử chat
      // scrollToBottom(); // Đã xử lý bằng useEffect [messages]
    });

    // --- Lắng nghe tin nhắn mới ---
    socket.on("new-message", (message) => {
      // message có dạng { id, text, senderId, senderName, timestamp }
      // Thêm tin nhắn vào cuối mảng để hiển thị
      setMessages((prevMessages) => [...prevMessages, message]);
      // scrollToBottom(); // Đã xử lý bằng useEffect [messages]
    });

    // Lắng nghe lỗi gửi tin nhắn
    socket.on("message-error", (error) => {
      console.error("Message Error:", error.message);
      toast.error(error.message || "Gửi tin nhắn thất bại.");
    });

    // Lắng nghe lỗi chung từ server (ví dụ: phòng không tồn tại khi cố gửi tin)
    socket.on("connect_error", (err) => {
      console.error("Connection error:", err.message);
      toast.error(`Kết nối thất bại: ${err.message}`);
      setJoined(false); // Reset trạng thái nếu mất kết nối
    });

    socket.on("disconnect", (reason) => {
      console.log("Disconnected:", reason);
      toast.error(`Mất kết nối: ${reason}`);
      setJoined(false); // Reset trạng thái
    });

    socket.on("admin-called-successfully", (data) => {
      toast.success(data.message || "Đã gọi Thổ Địa thành công!");
      setIsAdminCallPending(false); // Kích hoạt lại nút ngay khi có xác nhận
    });

    socket.on("admin-call-error", (data) => {
      toast.error(data.message || "Gọi Thổ Địa thất bại.");
      setIsAdminCallPending(false); // Kích hoạt lại nút khi có lỗi
    });

    socket.on("admin-call-status-changed", (data) => {
      console.log("Admin call status changed:", data.enabled);
      setCanCallAdmin(data.enabled);
      // if (data.enabled) {
      //   toast.success("Tính năng 'Gọi Thổ Địa' đã được BẬT.");
      // } else {
      //   toast.warn("Tính năng 'Gọi Thổ Địa' đã được TẮT.");
      // }
    });

    // --- Cleanup listeners ---
    return () => {
      socket.off("new-question");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("room-joined");
      socket.off("new-message");
      socket.off("message-error");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("admin-called-successfully");
      socket.off("admin-call-error");
      socket.off("admin-call-status-changed");
    };
    // Chỉ phụ thuộc vào socket và hàm scroll (ít thay đổi)
  }, [socket, scrollToBottom, joined, roomCode, username, level]);

  // Hàm định dạng timestamp (ví dụ đơn giản)
  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // --- Tạo URL để mời ---
  // Nên lấy base URL từ biến môi trường thay vì hardcode
  const inviteUrl = joined ? `${window.location.origin}?room=${roomCode}` : "";

  return (
    // --- Container chính ---
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 via-pink-400 to-rose-300 p-4 pt-8 md:p-6">
      {/* --- Header chung --- */}
      <h1 className="text-white text-3xl md:text-4xl font-bold mb-4 text-center">
        🎉 Touch Me 🎉
      </h1>
      {joined && (
        <h2 className="text-white text-lg md:text-xl font-semibold mb-4 text-center">
          Phòng: <span className="text-yellow-300 font-bold">{roomCode}</span> |
          Số người: <span className="font-bold">{userCount}</span>
        </h2>
      )}

      {/* --- Giao diện chính --- */}
      {!joined ? (
        // --- Form Join/Create Room ---
        <div className="bg-white bg-opacity-90 p-6 rounded-2xl w-full max-w-sm text-center space-y-4 shadow-xl border border-gray-200">
          <p className="text-gray-800 text-xl font-semibold">
            Tham gia hoặc Tạo phòng
          </p>
          {/* Input Username */}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nhập tên của bạn"
            className="w-full rounded-lg p-3 text-lg font-medium text-center border border-gray-300 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
            maxLength={20}
          />
          {/* Input Room Code */}
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Nhập mã phòng (6 ký tự)"
            maxLength={6}
            className="w-full rounded-lg p-3 text-lg font-semibold text-center uppercase border border-gray-300 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
          />
          {/* Level Select */}
          <div className="w-full">
            <label
              htmlFor="level"
              className="block text-sm font-medium text-gray-700 mb-1 text-left"
            >
              Cấp độ (khi tạo phòng mới)
            </label>
            <select
              id="level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full px-4 py-2 text-lg font-medium text-gray-700 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="level1">Level 1</option>
              <option value="level2">Level 2</option>
              <option value="level3">Level 3</option>
            </select>
          </div>
          {/* Buttons */}
          <button
            onClick={joinRoom}
            className="w-full bg-rose-500 text-white py-3 rounded-xl font-bold hover:bg-rose-600 transition text-lg shadow-md"
          >
            Tham gia / Tạo phòng
          </button>
          <button
            onClick={() => {
              const code = Math.random()
                .toString(36)
                .substring(2, 8)
                .toUpperCase();
              setRoomCode(code);
            }}
            className="w-full bg-cyan-500 text-white py-3 rounded-xl font-bold hover:bg-cyan-600 transition text-lg shadow-md"
          >
            Lấy mã phòng ngẫu nhiên
          </button>
        </div>
      ) : (
        // --- Giao diện trong phòng (Chia cột) ---
        // Container lớn hơn, sử dụng flex cho 2 cột
        <div
          className="bg-white bg-opacity-95 p-4 md:p-6 rounded-2xl w-full max-w-sm md:max-w-4xl lg:max-w-5xl space-y-4 md:space-y-0 md:space-x-6 shadow-xl flex flex-col md:flex-row border border-gray-200"
          // style={{ height: "80vh", maxHeight: "700px" }}
        >
          {/* Cột Trái: Câu hỏi và Nút điều khiển */}
          <div className="flex flex-col w-full md:w-3/5 space-y-4">
            <div className="text-center pt-3 border-t md:border-b pb-4 flex-shrink-0 flex flex-wrap justify-center gap-2">
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Câu hỏi hiện tại:
              </h3>
              <div className="text-xl md:text-2xl font-semibold text-purple-800 mb-4 break-words min-h-[60px] flex items-center justify-center px-2">
                {question ? question : "Đang chờ câu hỏi..."}
              </div>
              <button
                onClick={handleCallAdmin}
                disabled={isAdminCallPending || !canCallAdmin} // <<<=== THÊM ĐIỀU KIỆN !canCallAdmin
                className={`
    text-white px-4 py-2 rounded-lg font-bold text-base transition shadow
    ${
      isAdminCallPending || !canCallAdmin
        ? "bg-gray-400 opacity-50 cursor-not-allowed" // Style khi bị vô hiệu hóa
        : "bg-yellow-500 hover:bg-yellow-600" // Style khi được phép
    }
  `}
                title={
                  !canCallAdmin
                    ? "Tính năng Gọi Thổ Địa đang tắt"
                    : "Nhờ Thổ Địa hỗ trợ"
                }
              >
                📞 Gọi Admin {!canCallAdmin && "(Đang tắt)"}
              </button>
              <button
                onClick={randomQuestion}
                className="bg-rose-400 text-white px-4 py-2 md:px-5 rounded-xl font-bold text-base md:text-lg hover:bg-rose-500 transition shadow"
              >
                Câu hỏi mới
              </button>
              <button
                onClick={quitRoom}
                className="bg-gray-400 text-white px-4 py-2 md:px-5 rounded-xl font-bold text-base md:text-lg hover:bg-gray-500 transitions shadow"
              >
                Thoát phòng
              </button>
            </div>
            {/* --- Khu vực Mã QR Mời Bạn --- */}
            <div className="text-center pt-3 flex-grow flex flex-col items-center justify-center">
              <button
                onClick={() => setShowQrCode(!showQrCode)}
                className="text-blue-600 hover:text-blue-800 font-semibold text-sm mb-2"
              >
                {showQrCode ? "Ẩn mã mời" : "Hiện mã mời bạn bè (QR Code)"}
              </button>
              {showQrCode && inviteUrl && (
                <div className="bg-white p-3 inline-block rounded-lg border shadow-md">
                  <QRCode value={inviteUrl} size={128} level="M" />{" "}
                  {/* level="M" để dễ quét hơn */}
                  <p className="text-xs text-gray-600 mt-2">
                    Quét mã này để vào phòng
                  </p>
                  <input
                    type="text"
                    readOnly // Chỉ đọc
                    value={inviteUrl} // Hiển thị link
                    className="w-full text-xs text-center mt-1 p-1 border rounded bg-gray-100"
                    onClick={(e) => e.target.select()} // Chọn text khi click
                  />
                </div>
              )}
            </div>
            {/* ----------------------------- */}
            {/* (Tùy chọn) Có thể thêm danh sách người dùng ở đây nếu muốn */}
            {/* <div className="border-t pt-4"> ... </div> */}
          </div>
          {/* Cột Phải: Chat */}
          <div className="flex flex-col w-full md:w-2/5 border-t md:border-t-0 md:border-l border-gray-200 md:pl-6 pt-4 md:pt-0 overflow-hidden">
            <h3 className="text-base font-semibold text-center mb-2 flex-shrink-0 border-b pb-1">
              Chat Box
            </h3>
            {/* Khu vực hiển thị tin nhắn */}
            <div
              ref={chatDisplayRef}
              // Bỏ flex-grow, thêm max-height cụ thể (ví dụ: max-h-96 tương đương 24rem hoặc 384px)
              // Bạn có thể điều chỉnh giá trị max-h- này (vd: max-h-80, max-h-[400px]) cho phù hợp với giao diện
              className="overflow-y-auto mb-2 pr-2 space-y-1.5 min-h-[200px] max-h-96 rounded-md p-1 bg-gray-50"
              // Giữ lại: overflow-y-auto, mb-2, pr-2, space-y-1.5, min-h-[200px], border, rounded, p-2, bg-gray-50
              // Bỏ đi: flex-grow
              // Thêm vào: max-h-96 (hoặc giá trị khác bạn muốn)
            >
              {messages.length === 0 && (
                <p className="text-center text-gray-400 italic text-sm mt-4">
                  Bắt đầu trò chuyện...
                </p>
              )}
              {messages.map((msg) => {
                // --- SỬ DỤNG COMPONENT MỚI CHO TIN HỆ THỐNG ---
                if (msg.type === "system-question") {
                  return (
                    <SystemChatMessage
                      key={msg.id || msg.timestamp}
                      msg={msg}
                      formatTime={formatTime}
                    />
                  );
                }
                // --- Render tin nhắn người dùng bình thường ---
                else {
                  return (
                    <ChatMessage
                      key={msg.id || msg.timestamp}
                      msg={msg}
                      socketId={socket.id}
                      formatTime={formatTime}
                      handleOpenImage={handleOpenImage} // Truyền hàm mở ảnh
                    />
                  );
                }
                // ------------------------------------------
              })}
            </div>

            {/* Khu vực nhập tin nhắn */}
            <form
              onSubmit={sendMessage}
              className="flex items-center pt-3 flex-shrink-0"
            >
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Nhập tin nhắn..."
                className="flex-grow px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="off"
                maxLength={300} // Giới hạn ký tự nếu cần
              />
              <button
                type="submit"
                className="bg-blue-500 text-white px-4 py-2 rounded-r-lg font-semibold hover:bg-blue-600 transition"
                disabled={!newMessage.trim()} // Vô hiệu hóa nút nếu input trống
              >
                Gửi
              </button>
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                id="upload-image"
                onChange={handleImageUpload}
              />
              <label
                htmlFor="upload-image"
                className="ml-2 cursor-pointer text-blue-500 text-sm hover:underline"
              >
                📎
              </label>
            </form>
          </div>{" "}
          {/* Hết cột phải (Chat) */}
        </div> // Hết giao diện trong phòng
      )}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
          onClick={handleCloseImage}
        >
          <img
            src={previewImage}
            alt="Ảnh phóng to"
            className="max-w-full max-h-[90vh] rounded shadow-xl"
            onClick={(e) => e.stopPropagation()} // ⛔ tránh đóng khi click vào ảnh
          />
        </div>
      )}
      <CallAdminDialog
        isOpen={showCallDialog}
        onClose={() => setShowCallDialog(false)}
        onSubmit={submitCallAdminMessage}
      />
    </div> // Hết container chính
  );
}
