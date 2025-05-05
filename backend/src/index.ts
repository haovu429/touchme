// touchme/backend/src/index.ts
require("dotenv").config();
const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore'; // <--- Import Timestamp
const path = require("path");
const fs = require("fs");

// --- Khởi tạo Firebase Admin SDK (giữ nguyên logic của bạn) ---
let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("Firebase Admin SDK initialized from Config Var.");
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    console.log("Firebase Admin SDK initialized using GOOGLE_APPLICATION_CREDENTIALS.");
  } else {
    const fallbackKeyPath = path.resolve(__dirname, '../serviceAccountKey.json');
    if (fs.existsSync(fallbackKeyPath)) {
      serviceAccount = require(fallbackKeyPath);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.warn("Firebase Admin SDK initialized using local key file (ensure not committed).");
    } else {
      throw new Error("Firebase credentials not found.");
    }
  }
} catch (error) {
  console.error("FATAL: Failed to initialize Firebase Admin SDK:", error);
  process.exit(1);
}

const db = admin.firestore();
let loadedQuestions: { [key: string]: any[] } = {};

// --- Hàm tải câu hỏi từ Firestore (giữ nguyên) ---
async function loadQuestionsFromFirestore() {
  console.log("Loading questions from Firestore...");
  try {
    const levels = ['level1', 'level2', 'level3'];
    const tempQuestions: { [key: string]: any[] } = {};
    for (const level of levels) {
      const docRef = db.collection('questions').doc(level);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        tempQuestions[level] = data?.items || []; // Giả định field là 'items'
        console.log(`Loaded ${tempQuestions[level].length} questions for ${level}.`);
      } else {
        console.warn(`Document for ${level} not found in Firestore.`);
        tempQuestions[level] = [];
      }
    }
    loadedQuestions = tempQuestions;
    console.log("Successfully loaded questions from Firestore.");
  } catch (error) {
    console.error("Error loading questions from Firestore:", error);
  }
}

// --- Hàm xóa lịch sử chat (dùng khi phòng trống - single dyno) ---
const BATCH_SIZE_DELETE = 400;
async function deleteChatHistory(roomCode: string) {
  console.log(`[Chat Deletion] Attempting to delete chat history for room: ${roomCode}`);
  const messagesRef = db.collection('rooms').doc(roomCode).collection('messages'); // Collection 'rooms', doc 'roomCode', subcollection 'messages'

  try {
    let query = messagesRef.orderBy('__name__').limit(BATCH_SIZE_DELETE);
    let snapshot = await query.get();
    let docsDeleted = 0;

    while (snapshot.size > 0) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => { batch.delete(doc.ref); });
      await batch.commit();
      docsDeleted += snapshot.size;
      console.log(`[Chat Deletion] Deleted ${snapshot.size} messages batch for room ${roomCode}. Total: ${docsDeleted}`);

      if (snapshot.size < BATCH_SIZE_DELETE) break;

      const lastVisible = snapshot.docs[snapshot.docs.length - 1];
      query = messagesRef.orderBy('__name__').startAfter(lastVisible).limit(BATCH_SIZE_DELETE);
      snapshot = await query.get();
    }
    if (docsDeleted > 0) console.log(`[Chat Deletion] Successfully deleted all (${docsDeleted}) messages for room: ${roomCode}`);
    else console.log(`[Chat Deletion] No messages found to delete for room: ${roomCode}`);
  } catch (error) {
    console.error(`[Chat Deletion] Error deleting chat history for room ${roomCode}:`, error);
  }
}

// --- Hàm lấy câu hỏi ngẫu nhiên (dùng loadedQuestions) ---
const getRandomQuestion = (level: string) => {
  const levelQuestions = loadedQuestions[level];
  if (levelQuestions && levelQuestions.length > 0) {
    const randomIndex = Math.floor(Math.random() * levelQuestions.length);
    return levelQuestions[randomIndex];
  } else {
    console.warn(`No questions found or loaded for level: ${level}`);
    return { content: "Không tải được câu hỏi cho cấp độ này.", id: 'error-loading', question: 0 };
  }
};



// --- Khởi chạy server sau khi tải câu hỏi ---
loadQuestionsFromFirestore().then(() => {
  const app = express();

  // --- Cấu hình CORS ---
  const NODE_ENV = process.env.NODE_ENV || "development";
  console.log(`Running in ${NODE_ENV} mode`);
  const frontendUrl = process.env.FRONTEND_URL;
  const allowedOrigins = [
    "http://localhost:5173",
    "https://www.touchme.today",
    "https://touchme.today" // Thêm non-www
  ];
  if (frontendUrl && !allowedOrigins.includes(frontendUrl)) {
    allowedOrigins.push(frontendUrl);
    console.log(`Allowing CORS for deployed frontend from ENV: ${frontendUrl}`);
  } else if (!frontendUrl && NODE_ENV === 'production') {
    console.error("ERROR: FRONTEND_URL environment variable is not set in production! CORS might fail.");
  }
  console.log("Allowed origins for CORS:", allowedOrigins);

  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: function (origin: any, callback: any) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          console.error(`CORS Error: Origin ${origin} Not Allowed.`);
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
    })
  );

  // --- Endpoint test ---
  app.get("/", (req: any, res: any) => {
    const clientIp = req.ip;
    console.log(`Received request on /test endpoint from IP: ${clientIp}`);
    res.status(200).send(`Backend is running! Your IP: ${clientIp}`);
  });

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: allowedOrigins } });

  const users: { [key: string]: any } = {}; // { socketId: { username, currentRoom } }
  const rooms = new Map<string, any>([]); // Map [roomCode: string]: { roomKey, question, host, users: Map<string, string> }

  // --- Hàm tạo phòng (nên định nghĩa bên ngoài io.on) ---
  const createRoom = (socket: any, roomCode: string, level = "level1", username = "Anonymous") => {
    console.log("Creating room with code: ", roomCode);
    if (rooms.has(roomCode)) {
      socket.emit("room-exists", { message: "Room already exists!" });
      console.warn(`Attempt to create existing room: ${roomCode}`);
      return null;
    }
    const randomQuestion = getRandomQuestion(level);
    const newRoomData = {
      roomKey: roomCode,
      question: randomQuestion,
      host: socket.id,
      users: new Map<string, string>() // Map [socketId: string]: username
    };
    newRoomData.users.set(socket.id, username);
    rooms.set(roomCode, newRoomData);
    socket.join(roomCode);
    users[socket.id] = { username, currentRoom: roomCode };
    console.log(`User ${socket.id} (${username}) created and joined room ${roomCode}`);
    socket.emit("room-created", { roomCode, question: randomQuestion, userCount: 1, message: "Room created successfully!" });
    console.log(`Room ${roomCode} created with initial question: ${randomQuestion?.content}`);
    return newRoomData;
  }

  // --- Xử lý Socket connection ---
  io.on("connection", (socket: any) => {
    console.log(`User connected: ${socket.id}`);

    // --- Sự kiện join-room (Thêm logic lấy lịch sử chat) ---
    socket.on("join-room", async (roomCode: string, username = "Anonymous", level = "level1") => {
      console.log(`User ${socket.id} (${username}) trying to join room ${roomCode}`);

      // Xử lý rời phòng cũ (nếu có)
      const currentRoomData = users[socket.id];
      if (currentRoomData && currentRoomData.currentRoom && currentRoomData.currentRoom !== roomCode) {
        const oldRoomCode = currentRoomData.currentRoom;
        socket.leave(oldRoomCode);
        const oldRoom = rooms.get(oldRoomCode);
        if (oldRoom) {
          oldRoom.users.delete(socket.id);
          if (oldRoom.users.size === 0) {
            rooms.delete(oldRoomCode);
            console.log(`Room ${oldRoomCode} deleted from memory as it became empty.`);
            deleteChatHistory(oldRoomCode); // Xóa lịch sử khi phòng trống
          } else {
            socket.to(oldRoomCode).emit("user-left", { userId: socket.id, username: currentRoomData.username, userCount: oldRoom.users.size });
          }
        }
        console.log(`User ${socket.id} (${username}) left room ${oldRoomCode}`);
      }

      let roomData = rooms.get(roomCode);
      let isNewRoom = false;
      let initialQuestion: any = null;

      // Tạo phòng mới nếu chưa có
      if (!roomData) {
        roomData = createRoom(socket, roomCode, level, username);
        if (!roomData) return; // Lỗi tạo phòng
        isNewRoom = true;
        initialQuestion = roomData.question;
      } else {
        // Tham gia phòng đã có
        socket.join(roomCode);
        roomData.users.set(socket.id, username);
        users[socket.id] = { username, currentRoom: roomCode };
        initialQuestion = roomData.question; // Lấy câu hỏi hiện tại
        console.log(`User ${socket.id} (${username}) joined existing room ${roomCode}`);

        // --- GỬI TIN NHẮN HỆ THỐNG KHI JOIN PHÒNG ĐÃ CÓ ---
        const joinMessage = {
          id: `sys_join_${Date.now()}_${socket.id}`,
          text: `${username || 'Someone'} đã vào phòng.`,
          senderId: 'system',
          senderName: 'Hệ thống',
          timestamp: Date.now(),
          type: 'system' // Dùng chung type 'system'
        };
        io.to(roomCode).emit("new-message", joinMessage); // Gửi cho cả phòng
        // ----------------------------------------------
      }

      const userCount = roomData.users.size;

      // Gửi user-joined cho người khác nếu không phải phòng mới
      if (!isNewRoom) {
        socket.to(roomCode).emit("user-joined", { userId: socket.id, username, userCount });
      }

      // --- Lấy lịch sử chat ---
      let chatHistory: any[] = [];
      try {
        console.log(`Workspaceing chat history for room ${roomCode}...`);
        const messagesRef = db.collection('rooms').doc(roomCode).collection('messages');
        const snapshot = await messagesRef.orderBy('timestamp', 'asc').limit(50).get(); // Lấy 50 tin gần nhất, ASC để hiển thị đúng chiều
        snapshot.forEach(doc => {
          const data = doc.data();
          chatHistory.push({
            id: doc.id,
            text: data.text,
            senderId: data.senderId,
            senderName: data.senderName,
            timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : null // Chuyển sang milliseconds cho client
          });
        });
        console.log(`Workspaceed ${chatHistory.length} messages for room ${roomCode}.`);
      } catch (error) {
        console.error(`Error fetching chat history for room ${roomCode}:`, error);
      }

      // Gửi thông tin phòng và lịch sử chat cho client vừa join
      socket.emit("room-joined", { roomCode, question: initialQuestion, userCount, chatHistory }); // <-- Gửi kèm chatHistory
    });

    // --- Sự kiện get-question (Giữ nguyên logic, nhưng kiểm tra phòng tồn tại) ---
    socket.on("get-question", (data: any) => {
      const { roomCode, level } = data;
      const roomData = rooms.get(roomCode);

      if (roomData && roomData.users.has(socket.id)) {
        const selectedQuestion = getRandomQuestion(level);

        if (selectedQuestion && selectedQuestion.id !== 'error-loading') {
          roomData.question = selectedQuestion; // Cập nhật câu hỏi cho phòng
          console.log(`[New Question] Sending to room ${roomCode}: ${selectedQuestion.content}`);
          io.to(roomCode).emit("new-question", selectedQuestion); // Gửi câu hỏi mới cho mọi người

          // --- GỬI TIN NHẮN HỆ THỐNG (KÈM NỘI DUNG CÂU HỎI) ---
          const requestingUser = users[socket.id];
          if (requestingUser) {
            const systemMessage = {
              id: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              text: `${requestingUser.username || 'Someone'} đã yêu cầu câu hỏi mới (Level ${level}):`, // Thêm dấu :
              questionContent: selectedQuestion.content, // <<<=== THÊM NỘI DUNG CÂU HỎI
              senderId: 'system',
              senderName: 'Hệ thống',
              timestamp: Date.now(),
              type: 'system-question'
            };
            io.to(roomCode).emit("new-message", systemMessage); // Gửi qua kênh message như cũ
            console.log(`[System Msg] Sent 'new question requested' notification with content to room ${roomCode}`);
          }
          // ----------------------------------------------------

        } else {
          console.error(`[New Question] Failed get valid question for level ${level} in room ${roomCode}`);
          socket.emit("question-error", { message: "Không thể lấy câu hỏi mới." });
        }
      } else {
        console.warn(`[New Question] User ${socket.id} not in room ${roomCode} or room doesn't exist.`);
        socket.emit("question-error", { message: "Bạn không ở trong phòng này." });
      }
    });

    // --- SỰ KIỆN MỚI: Nhận và lưu tin nhắn ---
    socket.on("send-message", async (data: { roomCode: string, message: string }) => {
      const { roomCode, message } = data;
      const userData = users[socket.id];

      if (!userData || userData.currentRoom !== roomCode || !message || typeof message !== 'string' || message.trim().length === 0) {
        console.warn(`Invalid message attempt from ${socket.id} for room ${roomCode}`);
        socket.emit("message-error", { message: "Cannot send message." });
        return;
      }
      const roomData = rooms.get(roomCode);
      if (!roomData || !roomData.users.has(socket.id)) {
        console.warn(`User ${socket.id} tried to send message to room ${roomCode} but is not in it.`);
        socket.emit("message-error", { message: "You are not in this room." });
        return;
      }

      const trimmedMessage = message.trim().substring(0, 500); // Giới hạn độ dài tin nhắn nếu cần

      try {
        const messageData = {
          text: trimmedMessage,
          senderId: socket.id,
          senderName: userData.username || "Anonymous",
          timestamp: Timestamp.now() // Dùng Timestamp của Firestore Server
          // Không cần expiresAt nữa
        };

        // Thêm tin nhắn vào subcollection 'messages' của phòng
        const messageRef = await db.collection('rooms').doc(roomCode).collection('messages').add(messageData);
        console.log(`Message from ${userData.username} saved to room ${roomCode} with ID: ${messageRef.id}`);

        // Gửi tin nhắn tới tất cả mọi người trong phòng
        io.to(roomCode).emit("new-message", {
          id: messageRef.id,
          text: messageData.text,
          senderId: messageData.senderId,
          senderName: messageData.senderName,
          timestamp: messageData.timestamp?.toMillis ? messageData.timestamp.toMillis() : Date.now() // Gửi timestamp milliseconds
        });

      } catch (error) {
        console.error(`Error saving/sending message for room ${roomCode}:`, error);
        socket.emit("message-error", { message: "Failed to send message." });
      }
    });


    // --- Sự kiện disconnect (Cập nhật để gọi deleteChatHistory) ---
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
      const userData = users[socket.id];
      if (userData && userData.currentRoom) {
        const roomCode = userData.currentRoom;
        const roomData = rooms.get(roomCode);
        if (roomData) {
          const leavingUsername = userData.username || 'Someone'; // Lưu tên trước khi xóa
          roomData.users.delete(socket.id);
          const userCount = roomData.users.size;

          // --- GỬI TIN NHẮN HỆ THỐNG KHI DISCONNECT ---
          const leaveMessage = {
            id: `sys_leave_${Date.now()}_${socket.id}`,
            text: `${leavingUsername} đã rời phòng.`,
            senderId: 'system',
            senderName: 'Hệ thống',
            timestamp: Date.now(),
            type: 'system'
          };
          // Gửi trước khi xóa phòng (nếu đây là người cuối)
          if (userCount > 0) {
            io.to(roomCode).emit("new-message", leaveMessage);
          }
          // -------------------------------------------

          if (userCount === 0) {
            rooms.delete(roomCode);
            console.log(`[Disconnect] Room ${roomCode} deleted. Triggering chat deletion.`);
            deleteChatHistory(roomCode);
          } else {
            socket.to(roomCode).emit("user-left", { userId: socket.id, username: leavingUsername, userCount });
            // ... (xử lý host mới nếu cần) ...
          }
        }
      }
      delete users[socket.id];
    });

    // --- Sự kiện leave-room (Cập nhật để gọi deleteChatHistory) ---
    socket.on("leave-room", (roomCode: string) => {
      console.log(`User ${socket.id} trying to actively leave room ${roomCode}`);
      const userData = users[socket.id];
      const roomData = rooms.get(roomCode);

      if (userData && userData.currentRoom === roomCode && roomData && roomData.users.has(socket.id)) {
        const leavingUsername = userData.username || 'Someone';
        socket.leave(roomCode);
        roomData.users.delete(socket.id);
        delete users[socket.id];
        const userCount = roomData.users.size;

        // --- GỬI TIN NHẮN HỆ THỐNG KHI LEAVE ---
        const leaveMessage = {
          id: `sys_leave_${Date.now()}_${socket.id}`,
          text: `${leavingUsername} đã chủ động rời phòng.`,
          senderId: 'system',
          senderName: 'Hệ thống',
          timestamp: Date.now(),
          type: 'system'
        };
        // Gửi cho những người còn lại (nếu có)
        if (userCount > 0) {
          io.to(roomCode).emit("new-message", leaveMessage); // Gửi cho cả phòng cũng được
        }
        // ---------------------------------------

        if (userCount === 0) {
          rooms.delete(roomCode);
          console.log(`Room ${roomCode} deleted from memory as user ${socket.id} left.`);
          deleteChatHistory(roomCode); // <--- Gọi xóa lịch sử chat
        } else {
          socket.to(roomCode).emit("user-left", { userId: socket.id, username: userData.username, userCount });
          console.log(`User ${socket.id} actively left room ${roomCode}. Remaining: ${userCount}`);
          // Logic chuyển host nếu cần
          if (roomData.host === socket.id) {
            const newHostId = Array.from(roomData.users.keys())[0];
            if (newHostId) {
              roomData.host = newHostId;
              console.log(`New host for room ${roomCode}: ${newHostId}`);
            }
          }
        }
      } else {
        console.warn(`User ${socket.id} tried to leave room ${roomCode} but was not in it.`);
      }
    });
  });

  // --- Khởi động server HTTP ---
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

}).catch(err => {
  console.error("Failed to load initial questions before starting server:", err);
  process.exit(1);
});