require('dotenv').config();
const dotenv = require('dotenv');
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const questions = require("./questions.json");
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());

// 1. Xác định môi trường hiện tại (mặc định là 'development' nếu không được đặt)
const NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Running in ${NODE_ENV} mode`);

// 2. Danh sách các file .env cần nạp theo thứ tự ưu tiên (từ thấp đến cao)
const dotEnvFiles = [
  '.env',                                  // Base: Ưu tiên thấp nhất
  `.env.${NODE_ENV}`,                      // Ghi đè bởi môi trường cụ thể
  '.env.local',                            // Ghi đè bởi cài đặt local chung
  `.env.${NODE_ENV}.local`                 // Ghi đè bởi cài đặt local cho môi trường cụ thể (Ưu tiên cao nhất)
];

console.log('Attempting to load .env files in this order (later files override earlier ones):');
console.log(dotEnvFiles);

const allowOverride = process.env.NODE_ENV !== 'production';

console.log("process.env.FRONTEND_URL: ", process.env.FRONTEND_URL);

// 3. Nạp các file .env nếu chúng tồn tại
dotEnvFiles.forEach(filePath => {
  const fullPath = path.resolve(process.cwd(), filePath); // Lấy đường dẫn tuyệt đối
  if (fs.existsSync(fullPath)) { // Chỉ nạp nếu file tồn tại
    console.log(`Loading environment variables from: ${filePath}`);
    dotenv.config({
      path: fullPath,
      override: allowOverride // Cho phép file này ghi đè các biến đã được nạp trước đó (mặc định trong dotenv v14+)
    });
  }
});

// --- Đọc URL frontend từ biến môi trường ---
const frontendUrl = process.env.FRONTEND_URL; // Ví dụ: https://your-frontend.herokuapp.com

const allowedOrigins = [
  "http://localhost:5173"                               // URL frontend khi chạy local (nhớ thay cổng nếu cần)
  // Bạn có thể thêm các URL khác vào đây nếu cần (ví dụ: URL preview deploy)
];

if (frontendUrl) {
  allowedOrigins.push(frontendUrl); // Thêm URL từ biến môi trường nếu có
  console.log(`Allowing CORS for deployed frontend: ${frontendUrl}`);
} else if (process.env.NODE_ENV === 'production') {
  // Quan trọng: Nếu đang chạy ở môi trường production mà không có FRONTEND_URL
  // thì nên log lỗi hoặc có cơ chế xử lý phù hợp, vì có thể cấu hình thiếu.
  console.error("ERROR: FRONTEND_URL environment variable is not set in production!");
  // Có thể bạn muốn dừng ứng dụng ở đây hoặc hạn chế CORS chặt hơn
  // allowedOrigins = []; // Ví dụ: không cho phép origin nào nếu thiếu cấu hình
} else {
    console.warn("WARN: FRONTEND_URL environment variable is not set. Only allowing localhost.");
}

// --- Bật 'trust proxy' ---
// Điều này rất quan trọng khi deploy sau proxy (như Heroku)
// Nó giúp req.ip lấy đúng địa chỉ IP gốc của client từ header X-Forwarded-For
app.set('trust proxy', 1); // Tin tưởng 1 lớp proxy phía trước

const server = http.createServer(app);

// --- Cấu hình CORS cho Express HTTP requests ---
// Thay vì app.use(cors()), cấu hình cụ thể hơn:
app.use(cors({
  origin: function (origin, callback) {
    // Cho phép các request không có origin (như mobile apps, curl) trong một số trường hợp
    // hoặc khi origin nằm trong danh sách allowedOrigins
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`CORS Error: Origin ${origin} not allowed.`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Cho phép gửi cookie hoặc header Authorization nếu cần
}));

// --- Định nghĩa endpoint test HTTP GET tại /test ---
app.get("/", (req, res) => {
  // req: đối tượng request (chứa thông tin từ client gửi lên)
  // res: đối tượng response (dùng để gửi phản hồi về client)
  // Lấy địa chỉ IP của client
  const clientIp = req.ip; 
  
  // Log địa chỉ IP ra console server
  console.log(`Received request on /test endpoint from IP: ${clientIp}`); 

  // Gửi phản hồi về client
  res.status(200).send(`Hello! Your IP address is ${clientIp}. Test endpoint is working!`); 
  
  // Hoặc bạn có thể gửi JSON:
  // res.status(200).json({ message: "Test endpoint successful!", timestamp: new Date() });
});
// --- Kết thúc định nghĩa endpoint test ---

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    origin: "*",
  },
});

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
      console.log(`Sending question to room ${roomCode}: ${selectedQuestion.content}`); // Log câu hỏi gửi đi
      io.to(roomCode).emit("new-question", selectedQuestion); // Gửi câu hỏi ngẫu nhiên đến room
    }
  });
});

// --- Khởi động server HTTP ---
const PORT = process.env.PORT || 3001; // Lấy cổng từ Heroku hoặc dùng cổng mặc định
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

