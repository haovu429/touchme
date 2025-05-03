require("dotenv").config();
const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const questions = require("./questions.json");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());

// 1. Xác định môi trường hiện tại (mặc định là 'development' nếu không được đặt)
const NODE_ENV = process.env.NODE_ENV || "development";
console.log(`Running in ${NODE_ENV} mode`);

// 2. Danh sách các file .env cần nạp theo thứ tự ưu tiên (từ thấp đến cao)
const dotEnvFiles = [
  ".env", // Base: Ưu tiên thấp nhất
  `.env.${NODE_ENV}`, // Ghi đè bởi môi trường cụ thể
  ".env.local", // Ghi đè bởi cài đặt local chung
  `.env.${NODE_ENV}.local`, // Ghi đè bởi cài đặt local cho môi trường cụ thể (Ưu tiên cao nhất)
];

console.log(
  "Attempting to load .env files in this order (later files override earlier ones):"
);
console.log(dotEnvFiles);

const allowOverride = process.env.NODE_ENV !== "production";

console.log("process.env.FRONTEND_URL: ", process.env.FRONTEND_URL);

// 3. Nạp các file .env nếu chúng tồn tại
dotEnvFiles.forEach((filePath) => {
  const fullPath = path.resolve(process.cwd(), filePath); // Lấy đường dẫn tuyệt đối
  if (fs.existsSync(fullPath)) {
    // Chỉ nạp nếu file tồn tại
    console.log(`Loading environment variables from: ${filePath}`);
    dotenv.config({
      path: fullPath,
      override: allowOverride, // Cho phép file này ghi đè các biến đã được nạp trước đó (mặc định trong dotenv v14+)
    });
  }
});

// --- Đọc URL frontend từ biến môi trường ---
const frontendUrl = process.env.FRONTEND_URL; // Ví dụ: https://your-frontend.herokuapp.com

const allowedOrigins = [
  "http://localhost:5173", // URL frontend khi chạy local (nhớ thay cổng nếu cần)
  // Bạn có thể thêm các URL khác vào đây nếu cần (ví dụ: URL preview deploy)
];

if (frontendUrl) {
  allowedOrigins.push(frontendUrl); // Thêm URL từ biến môi trường nếu có
  console.log(`Allowing CORS for deployed frontend: ${frontendUrl}`);
} else if (process.env.NODE_ENV === "production") {
  // Quan trọng: Nếu đang chạy ở môi trường production mà không có FRONTEND_URL
  // thì nên log lỗi hoặc có cơ chế xử lý phù hợp, vì có thể cấu hình thiếu.
  console.error(
    "ERROR: FRONTEND_URL environment variable is not set in production!"
  );
  // Có thể bạn muốn dừng ứng dụng ở đây hoặc hạn chế CORS chặt hơn
  // allowedOrigins = []; // Ví dụ: không cho phép origin nào nếu thiếu cấu hình
} else {
  console.warn(
    "WARN: FRONTEND_URL environment variable is not set. Only allowing localhost."
  );
}

// --- Bật 'trust proxy' ---
// Điều này rất quan trọng khi deploy sau proxy (như Heroku)
// Nó giúp req.ip lấy đúng địa chỉ IP gốc của client từ header X-Forwarded-For
app.set("trust proxy", 1); // Tin tưởng 1 lớp proxy phía trước

const server = http.createServer(app);

// --- Cấu hình CORS cho Express HTTP requests ---
// Thay vì app.use(cors()), cấu hình cụ thể hơn:
app.use(
  cors({
    origin: function (origin: any, callback: any) {
      // Cho phép các request không có origin (như mobile apps, curl) trong một số trường hợp
      // hoặc khi origin nằm trong danh sách allowedOrigins
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.error(`CORS Error: Origin ${origin} not allowed.`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Cho phép gửi cookie hoặc header Authorization nếu cần
  })
);

// --- Định nghĩa endpoint test HTTP GET tại /test ---
app.get("/", (req: any, res: any) => {
  // req: đối tượng request (chứa thông tin từ client gửi lên)
  // res: đối tượng response (dùng để gửi phản hồi về client)
  // Lấy địa chỉ IP của client
  const clientIp = req.ip;

  // Log địa chỉ IP ra console server
  console.log(`Received request on /test endpoint from IP: ${clientIp}`);

  // Gửi phản hồi về client
  res
    .status(200)
    .send(`Hello! Your IP address is ${clientIp}. Test endpoint is working!`);

  // Hoặc bạn có thể gửi JSON:
  // res.status(200).json({ message: "Test endpoint successful!", timestamp: new Date() });
});
// --- Kết thúc định nghĩa endpoint test ---

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
  },
});

// Lưu trữ thông tin người dùng đơn giản (ví dụ) - Trong ứng dụng thực tế có thể phức tạp hơn
const users: { [key: string]: any } = {}; // Ví dụ: { "socketId1": { username: "Alice", currentRoom: "room123" }, ... }
const rooms = new Map([]); // Ví dụ: { "room123": { users: ["socketId1", "socketId2"], ... } }
const demoRoom = {
  'as123': {
    roomKey: "as123",
    currentQuestion: "What is the capital of France?",
  },
};

io.on("connection", (socket: any) => {

  const createRoom = (roomCode: string, username: "Anonymous") => {

  }

  // Khi người dùng tham gia phòng
  socket.on("join-room", (roomCode: string, username = "Anonymous") => {
    // Rời khỏi các phòng khác (nếu có) - Quan trọng nếu bạn chỉ muốn user ở 1 phòng tại 1 thời điểm
    Object.keys(socket.rooms); //trả về cả socket.id, cần lọc ra
    // Hoặc cách tốt hơn là lưu phòng hiện tại của user
    const currentRoom = users[socket.id]?.currentRoom;
    if (currentRoom && currentRoom !== roomCode) {
      socket.leave(currentRoom);
      // Thông báo cho phòng cũ (tùy chọn)
      const updatedOldRoomUserCount =
        io.sockets.adapter.rooms.get(currentRoom)?.size || 0;
      socket.to(currentRoom).emit("user-left", {
        userId: socket.id,
        username: users[socket.id]?.username || "Anonymous",
        userCount: updatedOldRoomUserCount,
      });
      console.log(`User ${socket.id} (${username}) left room ${currentRoom}`);
    }
    socket.join(roomCode);
    // Lưu thông tin user (ví dụ)
    users[socket.id] = { username: username, currentRoom: roomCode };

    console.log(`User ${socket.id} (${username}) joined room ${roomCode}`);

    // Lấy số lượng người dùng hiện tại trong phòng
    // Dùng `io.sockets.adapter.rooms.get(roomCode)` để lấy Set các socket ID trong phòng
    // `?.size` để tránh lỗi nếu phòng không tồn tại hoặc rỗng
    const userCount = io.sockets.adapter.rooms.get(roomCode)?.size || 0;

    // Gửi sự kiện "user-joined" tới TẤT CẢ MỌI NGƯỜI trong phòng (bao gồm cả người mới vào)
    // io.to(roomCode).emit("user-joined", {
    //   userId: socket.id,
    //   username: username,
    //   message: `${username} has joined the room!`,
    //   userCount: userCount, // Gửi kèm số lượng người dùng
    // });

    // Hoặc chỉ gửi tới những người khác (không bao gồm người mới vào)
    socket.to(roomCode).emit("user-joined", {
      userId: socket.id,
      username: username,
      message: `${username} has joined!`,
      userCount: userCount,
    });
    // Gửi thông tin phòng hiện tại về cho client vừa join (tùy chọn)
    socket.emit("room-joined", { roomCode, userCount });
  });

  // Khi người dùng yêu cầu câu hỏi (theo roomCode và cấp độ)
  socket.on("get-question", (data: any) => {
    const { roomCode, level } = data; // Lấy roomCode và level từ dữ liệu nhận được
    const levelQuestions = questions[level]; // Lấy câu hỏi từ cấp độ (level1, level2, level3)

    if (levelQuestions) {
      const randomIndex = Math.floor(Math.random() * levelQuestions.length);
      const selectedQuestion = levelQuestions[randomIndex]; // Chọn câu hỏi ngẫu nhiên
      console.log(
        `Sending question to room ${roomCode}: ${selectedQuestion.content}`
      ); // Log câu hỏi gửi đi
      io.to(roomCode).emit("new-question", selectedQuestion); // Gửi câu hỏi ngẫu nhiên đến room
    }
  });

  // --- Xử lý khi người dùng ngắt kết nối ---
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    const userData = users[socket.id]; // Lấy thông tin user đã lưu

    if (userData && userData.currentRoom) {
      const roomCode = userData.currentRoom;
      // Người dùng này đã rời phòng một cách tự nhiên khi ngắt kết nối
      // Thông báo cho những người còn lại trong phòng
      const userCount = io.sockets.adapter.rooms.get(roomCode)?.size || 0; // Số người còn lại

      // Gửi sự kiện user-left tới những người còn lại
      socket.to(roomCode).emit("user-left", {
        userId: socket.id,
        username: userData.username || "Anonymous",
        message: `${userData.username || "Anonymous"} has left the room.`,
        userCount: userCount, // Gửi kèm số lượng người dùng còn lại
      });
      console.log(
        `User ${socket.id} (${userData.username}) left room ${roomCode} due to disconnection.`
      );
    }
    // Xóa thông tin user khi họ disconnect
    delete users[socket.id];
  });

  // (Tùy chọn) Xử lý khi người dùng chủ động rời phòng mà không ngắt kết nối
  socket.on("leave-room", (roomCode: string) => {
    const userData = users[socket.id];
    if (userData && userData.currentRoom === roomCode) {
      socket.leave(roomCode);
      const userCount = io.sockets.adapter.rooms.get(roomCode)?.size || 0;
      // Thông báo cho những người còn lại
      socket.to(roomCode).emit("user-left", {
        userId: socket.id,
        username: userData.username || "Anonymous",
        message: `${userData.username || "Anonymous"} has left the room.`,
        userCount: userCount,
      });
      console.log(
        `User ${socket.id} (${userData.username}) actively left room ${roomCode}.`
      );
      // Cập nhật hoặc xóa thông tin user
      delete users[socket.id]; // Hoặc users[socket.id].currentRoom = null;
    }
  });
});

// --- Khởi động server HTTP ---
const PORT = process.env.PORT || 3001; // Lấy cổng từ Heroku hoặc dùng cổng mặc định
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
