// touchme/backend/src/index.ts
require("dotenv").config();
const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
// const questions = require("./questions.json"); // <--- Bỏ dòng này đi
import * as admin from 'firebase-admin'; // <--- Import firebase-admin
const path = require("path");
const fs = require("fs");

// --- Khởi tạo Firebase Admin SDK ---
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
    // Ưu tiên lấy từ Config Var trên Heroku
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
    console.log("Attempting to initialize Firebase Admin SDK from FIREBASE_SERVICE_ACCOUNT_KEY_JSON...");
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
     // Dùng cho local dev nếu đặt biến môi trường GOOGLE_APPLICATION_CREDENTIALS
     console.log("Attempting to initialize Firebase Admin SDK from GOOGLE_APPLICATION_CREDENTIALS...");
     // Không cần truyền credentials cụ thể vào initializeApp khi dùng biến này
     admin.initializeApp({
       credential: admin.credential.applicationDefault()
     });
     console.log("Firebase Admin SDK initialized using GOOGLE_APPLICATION_CREDENTIALS.");
  } else {
     throw new Error("Firebase credentials not found in environment variables.");
  }

  // Chỉ chạy initializeApp nếu serviceAccount được lấy từ JSON string
  if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin SDK initialized successfully from JSON string.");
  }

} catch (error) {
  console.error("Failed to initialize Firebase Admin SDK:", error);
  // Cần xử lý lỗi phù hợp, ví dụ: dừng ứng dụng hoặc chạy với dữ liệu rỗng/mặc định
  process.exit(1); // Thoát nếu không thể khởi tạo Firebase
}

const db = admin.firestore(); // Khởi tạo Firestore
let loadedQuestions: { [key: string]: any[] } = {}; // Biến lưu trữ câu hỏi từ Firestore

// --- Hàm tải câu hỏi từ Firestore ---
async function loadQuestionsFromFirestore() {
  console.log("Loading questions from Firestore...");
  try {
    const levels = ['level1', 'level2', 'level3']; // Các level bạn có
    const tempQuestions: { [key: string]: any[] } = {};

    // Giả sử cấu trúc: Collection 'questions' -> Document 'level1', 'level2', 'level3'
    // Mỗi document có một field là mảng 'items' chứa các object câu hỏi.
    for (const level of levels) {
      const docRef = db.collection('questions').doc(level);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const data = docSnap.data();
        // Lấy mảng câu hỏi từ field 'items' (điều chỉnh nếu tên field khác)
        tempQuestions[level] = data?.items || [];
        console.log(`Loaded ${tempQuestions[level].length} questions for ${level}.`);
      } else {
        console.warn(`Document for ${level} not found in Firestore.`);
        tempQuestions[level] = []; // Gán mảng rỗng nếu không tìm thấy
      }
    }
    loadedQuestions = tempQuestions; // Cập nhật biến toàn cục
    console.log("Successfully loaded questions from Firestore.");
  } catch (error) {
    console.error("Error loading questions from Firestore:", error);
    // Có thể thêm logic dự phòng ở đây, ví dụ đọc từ file JSON cũ nếu lỗi
  }
}

// Gọi hàm tải câu hỏi khi server khởi động
// Lưu ý: Nên đảm bảo việc tải hoàn tất trước khi server bắt đầu nhận request
// hoặc có cơ chế xử lý nếu `loadedQuestions` còn rỗng.
// Cách đơn giản là dùng await ở top level (cần cấu hình tsconfig hoặc môi trường hỗ trợ)
// Hoặc gọi trong một hàm async và await trước khi server.listen
// Ví dụ đơn giản:
loadQuestionsFromFirestore().then(() => {
  // Các phần còn lại của code (Express, Socket.IO, server.listen) sẽ nằm ở đây
  // hoặc bạn có thể đặt server.listen ở đây để đảm bảo questions đã load.

  const app = express();
  // --- Cấu hình CORS và các phần khác của Express ---
  app.use(cors());
  // ... (Copy phần loading .env, xác định allowedOrigins, trust proxy, CORS config...)

  // --- Logic CORS (Giữ nguyên hoặc điều chỉnh nếu cần) ---
  const NODE_ENV = process.env.NODE_ENV || "development";
  console.log(`Running in ${NODE_ENV} mode`);
  const frontendUrl = process.env.FRONTEND_URL;
  const allowedOrigins = [
      "http://localhost:5173",
      "https://www.touchme.today" // Giữ lại origin này
  ];
  if (frontendUrl) {
      // Chỉ thêm nếu nó khác với origin đã hardcode
      if (frontendUrl !== "https://www.touchme.today") {
          allowedOrigins.push(frontendUrl);
      }
      console.log(`Allowing CORS for deployed frontend: ${frontendUrl}`);
  } else if (process.env.NODE_ENV === "production") {
      console.error("ERROR: FRONTEND_URL environment variable is not set in production!");
  } else {
      console.warn("WARN: FRONTEND_URL environment variable is not set. Only allowing localhost and hardcoded origin.");
  }
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: function (origin: any, callback: any) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          console.error(`CORS Error: Origin ${origin} not allowed.`);
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
    })
  );

  // --- Endpoint test ---
  app.get("/", (req: any, res: any) => {
    const clientIp = req.ip;
    console.log(`Received request on /test endpoint from IP: ${clientIp}`);
    res
      .status(200)
      .send(`Hello! Your IP address is ${clientIp}. Test endpoint is working!`);
  });

  const server = http.createServer(app);
  const io = new Server(server, {
      cors: {
          origin: allowedOrigins,
      },
  });

  // Lưu trữ thông tin người dùng, phòng (giữ nguyên)
  const users: { [key: string]: any } = {};
  const rooms = new Map<string, any>([]); // Sử dụng Map để dễ quản lý hơn

  // --- Hàm lấy câu hỏi ngẫu nhiên (SỬA ĐỂ DÙNG loadedQuestions) ---
  const getRandomQuestion = (level: string) => {
      const levelQuestions = loadedQuestions[level]; // <--- Lấy từ biến đã load
      if (levelQuestions && levelQuestions.length > 0) {
          const randomIndex = Math.floor(Math.random() * levelQuestions.length);
          const selectedQuestion = levelQuestions[randomIndex];
          return selectedQuestion;
      } else {
          console.warn(`No questions found or loaded for level: ${level}`);
          // Trả về một giá trị mặc định hoặc null để xử lý ở nơi gọi
          return { content: "Không tải được câu hỏi cho cấp độ này.", id: 'error-loading', question: 0 };
      }
  }

  // --- Hàm tạo phòng (SỬA ĐỂ DÙNG getRandomQuestion) ---
  // Nên định nghĩa hàm này bên ngoài io.on("connection")
  const createRoom = (socket: any, roomCode: string, level = "level1", username = "Anonymous") => {
      console.log("Creating room with code: ", roomCode);
      // Kiểm tra xem phòng đã tồn tại chưa
      if (rooms.has(roomCode)) {
          socket.emit("room-exists", { message: "Room already exists!" });
          console.warn(`Attempt to create existing room: ${roomCode}`);
          return null; // Trả về null hoặc thông tin lỗi
      }

      const randomQuestion = getRandomQuestion(level); // Lấy câu hỏi đầu tiên

      // Tạo phòng mới trong Map
      const newRoomData = {
          roomKey: roomCode,
          question: randomQuestion, // Lưu cả object câu hỏi
          host: socket.id,
          users: new Map<string, string>() // Map để lưu socketId -> username
      };
      newRoomData.users.set(socket.id, username); // Thêm host vào phòng
      rooms.set(roomCode, newRoomData);

      // Tham gia phòng Socket.IO
      socket.join(roomCode);
      users[socket.id] = { username, currentRoom: roomCode };

      console.log(`User ${socket.id} (${username}) created and joined room ${roomCode}`);

      // Gửi thông báo và câu hỏi đầu tiên cho người tạo phòng
      socket.emit("room-created", { roomCode, question: randomQuestion, userCount: 1, message: "Room created successfully!" });
      console.log(`Room ${roomCode} created with initial question: ${randomQuestion?.content}`);
      return newRoomData; // Trả về dữ liệu phòng mới tạo
  }


  // --- Xử lý Socket connection ---
  io.on("connection", (socket: any) => {
      console.log(`User connected: ${socket.id}`);

      // Khi người dùng tham gia phòng
      socket.on("join-room", (roomCode: string, username = "Anonymous", level = "level1") => {
          console.log(`User ${socket.id} (${username}) is trying to join room ${roomCode}`);

          // --- Xử lý rời phòng cũ ---
          const currentRoomData = users[socket.id];
          if (currentRoomData && currentRoomData.currentRoom && currentRoomData.currentRoom !== roomCode) {
              const oldRoomCode = currentRoomData.currentRoom;
              socket.leave(oldRoomCode);
              const oldRoom = rooms.get(oldRoomCode);
              if (oldRoom) {
                   oldRoom.users.delete(socket.id); // Xóa user khỏi phòng cũ trong Map
                   if (oldRoom.users.size === 0) {
                        rooms.delete(oldRoomCode); // Xóa phòng nếu không còn ai
                        console.log(`Room ${oldRoomCode} deleted as it became empty.`);
                   } else {
                        // Thông báo cho phòng cũ
                        socket.to(oldRoomCode).emit("user-left", {
                            userId: socket.id,
                            username: currentRoomData.username || "Anonymous",
                            userCount: oldRoom.users.size,
                        });
                   }
              }
              console.log(`User ${socket.id} (${username}) left room ${oldRoomCode}`);
          }

          let roomData = rooms.get(roomCode);
          let isNewRoom = false;

          // Nếu phòng chưa tồn tại -> Tạo mới
          if (!roomData) {
              console.log(`Room ${roomCode} does not exist. Creating...`);
              roomData = createRoom(socket, roomCode, level, username);
              if (!roomData) return; // Dừng nếu tạo phòng thất bại (ví dụ: đã tồn tại do race condition?)
              isNewRoom = true;
          } else {
              // Nếu phòng đã tồn tại -> Tham gia
              socket.join(roomCode);
              roomData.users.set(socket.id, username); // Thêm user vào phòng trong Map
              users[socket.id] = { username, currentRoom: roomCode }; // Cập nhật thông tin user
              console.log(`User ${socket.id} (${username}) joined existing room ${roomCode}`);
          }

          const userCount = roomData.users.size;

          // Chỉ gửi 'user-joined' cho người khác nếu đây không phải là phòng mới tạo (vì người tạo đã nhận 'room-created')
          if (!isNewRoom) {
                socket.to(roomCode).emit("user-joined", {
                    userId: socket.id,
                    username: username,
                    message: `${username} has joined!`,
                    userCount: userCount,
                });
          }

          // Gửi thông tin phòng (gồm câu hỏi hiện tại) về cho client vừa join
          // Dùng roomData.question vì nó chứa cả object câu hỏi
          socket.emit("room-joined", { roomCode, question: roomData?.question?.content, userCount });

      });

      // Khi người dùng yêu cầu câu hỏi mới
      socket.on("get-question", (data: any) => {
          const { roomCode, level } = data;
          const roomData = rooms.get(roomCode);

          // Kiểm tra xem phòng có tồn tại và người yêu cầu có trong phòng không (hoặc là host?)
          if (roomData && roomData.users.has(socket.id)) {
              const selectedQuestion = getRandomQuestion(level); // Lấy câu hỏi mới

              if (selectedQuestion && selectedQuestion.id !== 'error-loading') {
                    roomData.question = selectedQuestion; // Cập nhật câu hỏi mới cho phòng
                    console.log(`Sending new question to room ${roomCode}: ${selectedQuestion.content}`);
                    io.to(roomCode).emit("new-question", selectedQuestion); // Gửi câu hỏi mới đến mọi người trong phòng
              } else {
                   console.error(`Failed to get a valid question for level ${level} in room ${roomCode}`);
                   // Có thể gửi lỗi về cho người yêu cầu
                   socket.emit("question-error", { message: "Could not retrieve a new question." });
              }
          } else {
               console.warn(`User ${socket.id} requested question for room ${roomCode} but is not in it or room doesn't exist.`);
               // Gửi lỗi về client nếu cần
               socket.emit("question-error", { message: "You are not in this room or the room does not exist." });
          }
      });


      // --- Xử lý khi người dùng ngắt kết nối ---
      socket.on("disconnect", () => {
          console.log(`User disconnected: ${socket.id}`);
          const userData = users[socket.id];

          if (userData && userData.currentRoom) {
              const roomCode = userData.currentRoom;
              const roomData = rooms.get(roomCode);

              if (roomData) {
                    roomData.users.delete(socket.id); // Xóa user khỏi Map của phòng
                    const userCount = roomData.users.size;

                    if (userCount === 0) {
                        // Nếu không còn ai, xóa phòng
                        rooms.delete(roomCode);
                        console.log(`Room ${roomCode} deleted as it became empty.`);
                    } else {
                        // Thông báo cho những người còn lại
                        socket.to(roomCode).emit("user-left", {
                            userId: socket.id,
                            username: userData.username || "Anonymous",
                            message: `${userData.username || "Anonymous"} has left the room.`,
                            userCount: userCount,
                        });
                        console.log(`User ${socket.id} (${userData.username}) left room ${roomCode} due to disconnection. Remaining users: ${userCount}`);

                        // (Tùy chọn) Bầu host mới nếu host cũ disconnect
                        if (roomData.host === socket.id) {
                           const newHostId = Array.from(roomData.users.keys())[0]; // Lấy người đầu tiên làm host mới
                           if (newHostId) {
                             roomData.host = newHostId;
                             console.log(`New host for room ${roomCode} is ${newHostId} (${roomData.users.get(newHostId)})`);
                             // Thông báo host mới nếu cần: io.to(roomCode).emit('new-host', { hostId: newHostId });
                           }
                        }
                    }
              }
          }
          // Xóa thông tin user
          delete users[socket.id];
      });

      // --- Xử lý khi người dùng chủ động rời phòng ---
      socket.on("leave-room", (roomCode: string) => {
          console.log(`User ${socket.id} trying to actively leave room ${roomCode}`);
          const userData = users[socket.id];
          const roomData = rooms.get(roomCode);

          // Chỉ xử lý nếu user đúng là đang ở phòng đó
          if (userData && userData.currentRoom === roomCode && roomData && roomData.users.has(socket.id)) {
              socket.leave(roomCode); // Rời khỏi kênh Socket.IO
              roomData.users.delete(socket.id); // Xóa user khỏi Map của phòng
              delete users[socket.id]; // Xóa thông tin user
              const userCount = roomData.users.size;

              if (userCount === 0) {
                  rooms.delete(roomCode);
                  console.log(`Room ${roomCode} deleted as user ${socket.id} left.`);
              } else {
                  // Thông báo cho những người còn lại
                  socket.to(roomCode).emit("user-left", {
                      userId: socket.id,
                      username: userData.username || "Anonymous",
                      message: `${userData.username || "Anonymous"} has actively left the room.`,
                      userCount: userCount,
                  });
                  console.log(`User ${socket.id} (${userData.username}) actively left room ${roomCode}. Remaining users: ${userCount}`);

                   // (Tùy chọn) Bầu host mới nếu host cũ rời đi
                  if (roomData.host === socket.id) {
                      const newHostId = Array.from(roomData.users.keys())[0];
                      if (newHostId) {
                        roomData.host = newHostId;
                        console.log(`New host for room ${roomCode} is ${newHostId} (${roomData.users.get(newHostId)})`);
                        // Thông báo host mới nếu cần
                      }
                  }
              }
          } else {
              console.warn(`User ${socket.id} tried to leave room ${roomCode} but was not in it or room doesn't exist.`);
          }
      });
  });


  // --- Khởi động server HTTP ---
  const PORT = process.env.PORT || 3001; // Lấy cổng từ Heroku hoặc dùng cổng mặc định
  server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
  });

}).catch(err => {
    console.error("Failed to load questions before starting server:", err);
    process.exit(1); // Thoát nếu không load được questions ban đầu
});