const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const questions = require("./questions.json");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
// test hahaha
io.on("connection", (socket) => {
  // Khi người dùng tham gia phòng
  socket.on("join-room", (roomCode) => {
    socket.join(roomCode);
  });

  // Khi người dùng yêu cầu câu hỏi (theo roomCode và cấp độ)
  socket.on("get-question", (data) => {
    const { roomCode, level } = data; // Lấy roomCode và level từ dữ liệu nhận được
    const levelQuestions = questions[level]; // Lấy câu hỏi từ cấp độ (level1, level2, level3)

    if (levelQuestions) {
      const randomIndex = Math.floor(Math.random() * levelQuestions.length);
      const selectedQuestion = levelQuestions[randomIndex]; // Chọn câu hỏi ngẫu nhiên
      io.to(roomCode).emit("new-question", selectedQuestion); // Gửi câu hỏi ngẫu nhiên đến room
    }
  });
});

server.listen(3001, () => {
  console.log("✅ Backend đang chạy tại http://localhost:3001");
});
