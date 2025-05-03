import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { toast } from 'react-toastify'; // Import toast từ react-toastify

console.log("VITE_SOCKET_URL: ", import.meta.env.VITE_SOCKET_URL);
console.log("NODE_ENV: ", import.meta.env.NODE_ENV);
const socket = io(import.meta.env.VITE_SOCKET_URL);

export default function RealtimeQuestionRoom() {
  const [roomCode, setRoomCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [question, setQuestion] = useState(null);
  const [level, setLevel] = useState("level1");
  const [userCount, setUserCount] = useState(0);
  const [systemMessage, addSystemMessage] = useState("");

  // Hàm join phòng
  const joinRoom = () => {
    if (roomCode) {
      socket.emit("join-room", roomCode);
      setJoined(true);
    }
  };

  // Hàm gửi yêu cầu lấy câu hỏi từ server
  const randomQuestion = () => {
    socket.emit("get-question", { roomCode, level }); // Gửi roomCode và level tới backend
  };

  const quitRoom = () => {
    socket.emit("leave-room", { roomCode}); // Gửi roomCode và level tới backend
    window.location.reload()
  };

  // Lắng nghe câu hỏi từ server (socket)
  useEffect(() => {
    socket.on("new-question", (q) => {
      setQuestion(q.content); // Lấy nội dung câu hỏi
    });

    // Lắng nghe người dùng mới tham gia
    socket.on("user-joined", (data) => {
      console.log(
        `${data.username} (${data.userId}) joined. Total users: ${data.userCount}`
      );
      // Cập nhật UI: ví dụ hiển thị thông báo, cập nhật danh sách người dùng
      // setUsersInRoom(prevUsers => [...prevUsers, { id: data.userId, name: data.username }]);
      setUserCount(data.userCount);
      addSystemMessage(`${data.username} has joined.`);
      toast.info(`${data.username || 'Someone'} has joined! 👋`);
    });

    // Lắng nghe người dùng rời đi
    socket.on("user-left", (data) => {
      console.log(
        `${data.username} (${data.userId}) left. Total users: ${data.userCount}`
      );
      // Cập nhật UI: ví dụ hiển thị thông báo, cập nhật danh sách người dùng
      // setUsersInRoom(prevUsers => prevUsers.filter(user => user.id !== data.userId));
      setUserCount(data.userCount);
      addSystemMessage(`${data.username} has left.`);
      toast.warn(`${data.username || 'Someone'} has left.`); // Dùng toast.warn hoặc loại khác
    });

    // Lắng nghe xác nhận đã vào phòng (tùy chọn)
    socket.on("room-joined", (data) => {
      console.log(
        `Successfully joined room ${data.roomCode}. Users: ${data.userCount}`
      );
      toast.success(`Successfully joined room ${data.roomCode}. Users: ${data.userCount}`);
      setUserCount(data.userCount);
    });

    return () => {
      socket.off("new-question");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("room-joined");
    };
  }, [socket]);

  // Đừng quên gọi emit("join-room", roomCode, username) khi người dùng thực sự muốn vào phòng
  const joinRoomHandler = (selectedRoom, userName) => {
    socket.emit("join-room", selectedRoom, userName);
  };

  // (Tùy chọn) Gọi emit("leave-room", roomCode) khi người dùng nhấn nút rời phòng
  const leaveRoomHandler = (currentRoom) => {
    socket.emit("leave-room", currentRoom);
    // Cập nhật UI phía client ngay lập tức (ví dụ: quay về màn hình chọn phòng)
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 via-pink-400 to-rose-300 p-6">
      <h1 className="text-white text-4xl font-bold mb-10">
        🎉 Chao xìn, bạn muốn biết gì về tôi?
      </h1>
      <h2 className="text-white text-4xl font-bold mb-10">
        Phòng: {roomCode}, số người tham gia: {userCount}
      </h2>

      {!joined ? (
        <div className="bg-cyan-100 p-6 rounded-2xl w-full max-w-sm text-center space-y-4 shadow-lg">
          <p className="text-black-500 text-lg font-semibold">Nhập số phòng</p>
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            placeholder="AB12CD"
            className="w-full rounded-xl p-3 text-lg font-semibold text-center"
          />
          <button
            onClick={joinRoom}
            className="w-full bg-rose-400 text-white py-2 rounded-xl font-bold hover:bg-rose-500 transition"
          >
            Tham gia
          </button>
          <button
            onClick={() => {
              const code = Math.random()
                .toString(36)
                .substring(2, 8)
                .toUpperCase();
              setRoomCode(code);
            }}
            className="w-full bg-cyan-500 text-white py-2 rounded-xl font-bold hover:bg-cyan-600 transition"
          >
            Tạo phòng
          </button>
          <div className="w-full max-w-sm mx-auto">
            <label
              htmlFor="level"
              className="block text-lg font-semibold text-gray-700 mb-2"
            >
              Chọn cấp độ
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
        </div>
      ) : (
        <div className="bg-white p-6 rounded-2xl w-full max-w-md space-y-6 shadow-xl text-center">
         <div>
          <div className="text-2xl font-semibold text-purple-800">
            {question ? question : "Món ăn yêu thích của bạn là gì?"}
          </div>
          <button
            onClick={randomQuestion}
            className="bg-rose-400 text-white px-6 py-3 rounded-xl font-bold text-lg hover:bg-rose-500 transition"
          >
            Random câu hỏi
          </button>
          </div>
          <button
            onClick={quitRoom}
            className="bg-rose-400 text-whiteF px-6 py-3 rounded-xl font-bold text-lg hover:bg-rose-500 transition"
          >
            Thoát
          </button>
        </div>
      )}
    </div>
  );
}
