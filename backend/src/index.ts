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
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api'); // Thêm import này

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

// --- Biến trạng thái cho tính năng "Gọi Thổ Địa" ---
let isCallAdminEnabled = true; // Mặc định là bật khi server khởi động

// --- Hàm escape ký tự đặc biệt cho MarkdownV2 ---
const escapeMarkdownV2 = (text: string): string => {
  if (typeof text !== 'string') return '';
  // Các ký tự cần escape trong MarkdownV2
  // _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
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

  // --- Thêm state cho Rate Limiting "Gọi Thổ Địa" ---
  const callAdminTimestamps = new Map<string, number>(); // Key: socket.id, Value: timestamp (ms)
  const CALL_ADMIN_RATE_LIMIT_MS = 2 * 60 * 1000; // Ví dụ: 2 phút (tính bằng mili giây)
  // --------------------------------------------------


  // --- Khởi tạo Telegram Bot VÀ ĐẶT LISTENER Ở ĐÂY (SAU KHI io ĐƯỢC KHỞI TẠO) ---
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (botToken && adminChatId) {
    const bot = new TelegramBot(botToken, { polling: true });

    bot.onText(/^\/(oncalladmin|offcalladmin)$/, (msg: any) => {
      if (msg.chat.id.toString() === adminChatId) {
        if (msg.text === '/oncalladmin') {
          isCallAdminEnabled = true;
          console.log("[Admin Command] Call Admin feature ENABLED by admin.");
          bot.sendMessage(adminChatId, "Tính năng 'Gọi Thổ Địa' đã được BẬT.");
          io.emit("admin-call-status-changed", { enabled: true }); // <<<=== DÙNG io Ở ĐÂY
        } else if (msg.text === '/offcalladmin') {
          isCallAdminEnabled = false;
          console.log("[Admin Command] Call Admin feature DISABLED by admin.");
          bot.sendMessage(adminChatId, "Tính năng 'Gọi Thổ Địa' đã được TẮT.");
          io.emit("admin-call-status-changed", { enabled: false }); // <<<=== DÙNG io Ở ĐÂY
        }
      } else {
        console.warn(`[Admin Command] Unauthorized attempt by chat ID: ${msg.chat.id}`);
        bot.sendMessage(msg.chat.id, "Bạn không có quyền thực hiện lệnh này.");
      }
    });

    bot.on('polling_error', (error: any) => {
      console.error("[Telegram Bot] Polling error:", error.code, error.message?.substring(0, 100));
    });
    console.log("Telegram Bot listener for admin commands started (polling).");

  } else {
    console.warn("TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is not set. Bot command listener will not work.");
  }
  // --------------------------------------------------------------------

  // --- Hàm tạo phòng (cần truyền rooms, users, getRandomQuestion) ---
  const createRoom = (socket: any, roomCode: string, level = "level1", username = "Anonymous", roomsMap: Map<string, any>, usersMap: { [key: string]: any }, questionFunc: Function) => {
    console.log("[Room Creation] Creating room with code: ", roomCode);
    if (roomsMap.has(roomCode)) {
      socket.emit("room-exists", { message: `Room ${roomCode} already exists!` });
      console.warn(`[Room Creation] Attempt to create existing room: ${roomCode}`);
      return null;
    }
    const initialQuestion = questionFunc(level);
    const newRoomData = {
      roomKey: roomCode,
      question: initialQuestion,
      host: socket.id,
      users: new Map<string, string>()
    };
    newRoomData.users.set(socket.id, username);
    roomsMap.set(roomCode, newRoomData);
    socket.join(roomCode);
    usersMap[socket.id] = { username, currentRoom: roomCode };
    console.log(`[Room Creation] User ${socket.id} (${username}) created and joined room ${roomCode}`);
    socket.emit("room-created", { roomCode, question: initialQuestion, userCount: 1 });
    return newRoomData;
  };

  // --- Xử lý Socket connection ---
  io.on("connection", (socket: any) => {
    console.log(`User connected: ${socket.id}`);

    // Gửi trạng thái "Gọi Thổ Địa" ban đầu cho client
    socket.emit("admin-call-status-changed", { enabled: isCallAdminEnabled });

    // --- Sự kiện call-admin (Thêm kiểm tra trạng thái) ---
    socket.on("call-admin", async (data: { roomCode: string }) => {
      const { roomCode } = data;
      const userData = users[socket.id];

      // === KIỂM TRA RATE LIMIT ===
      const now = Date.now();
      const lastCallTime = callAdminTimestamps.get(socket.id);

      if (lastCallTime && (now - lastCallTime < CALL_ADMIN_RATE_LIMIT_MS)) {
        const timeLeftMs = CALL_ADMIN_RATE_LIMIT_MS - (now - lastCallTime);
        const timeLeftMinutes = Math.ceil(timeLeftMs / (60 * 1000)); // Làm tròn lên phút
        console.log(`[Call Admin] User ${socket.id} rate limited. Time left: ${timeLeftMinutes} minute(s).`);
        socket.emit("admin-call-error", { message: `Bạn vừa mới gọi Thổ Địa. Vui lòng thử lại sau khoảng ${timeLeftMinutes} phút.` });
        return;
      }
      // ===========================


      if (!isCallAdminEnabled) {
        console.log(`[Call Admin] Feature is disabled. User ${userData?.username} in room ${roomCode} tried.`);
        socket.emit("admin-call-error", { message: "Tính năng 'Gọi Thổ Địa' hiện đang tạm tắt." });
        return;
      }
      // ... (Phần còn lại của call-admin như cũ, dùng axios hoặc bot.sendMessage)
      if (!userData || userData.currentRoom !== roomCode) {
        console.warn(`[Call Admin] User ${socket.id} invalid call for room ${roomCode}.`);
        socket.emit("admin-call-error", { message: "Không thể gọi admin lúc này." });
        return;
      }
      if (!botToken || !adminChatId) { // Đảm bảo botToken và adminChatId vẫn có thể truy cập
        console.error("[Call Admin] Telegram Bot Token hoặc Admin Chat ID chưa được cấu hình trên backend.");
        socket.emit("admin-call-error", { message: "Chức năng gọi admin chưa được cấu hình đầy đủ." });
        return;
      }
      // --- Escape các giá trị động ---
      const safeRoomCode = escapeMarkdownV2(roomCode);
      const safeUsername = escapeMarkdownV2(userData.username || 'Người dùng ẩn danh');
      const safeSocketId = escapeMarkdownV2(socket.id);
      // --- Tạo messageText với định dạng MarkdownV2 ---
      // Ví dụ: In đậm một số phần, in nghiêng socket ID
      const messageText =
        `🆘 *Admin ơi, có người cần hỗ trợ\\!* 🆘

Phòng: *${safeRoomCode}*
Người gọi: *${safeUsername}*
_\\(Socket ID: ${safeSocketId}\\)_`; // Dùng _id_ cho in nghiêng

      const payload = {
        chat_id: adminChatId,
        text: messageText,
        parse_mode: 'MarkdownV2' // <<<=== THÊM LẠI VÀ DÙNG MARKDOWNV2
      };
      const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      try {
        await axios.post(telegramApiUrl, payload);
        console.log(`[Call Admin] Successfully sent Telegram message for room ${roomCode}`);
        socket.emit("admin-called-successfully", { message: "Đã thông báo cho Thổ Địa. Vui lòng chờ!" });

        // --- CẬP NHẬT TIMESTAMP CHO USER NÀY ---
        callAdminTimestamps.set(socket.id, Date.now());
        // ------------------------------------
      } catch (error: any) {
        if (error.response && error.response.data) {
          console.error("[Call Admin] Error sending Telegram message (Telegram API Response):", JSON.stringify(error.response.data, null, 2));
        } else {
          console.error("[Call Admin] Error sending Telegram message (Network/Axios error):", error.message);
        }
        socket.emit("admin-call-error", { message: "Lỗi khi cố gắng thông báo cho Thổ Địa." });
      }
    });

    // --- Các sự kiện khác (join-room, get-question, send-message, disconnect, leave-room) ---
    // Nhớ truyền users, rooms, getRandomQuestion vào createRoom khi gọi
    socket.on("join-room", async (roomCode: string, username = "Anonymous", level = "level1") => {
      console.log(`[Join Room] User ${socket.id} (${username}) trying to join room ${roomCode}`);
      const currentUserData = users[socket.id];
      if (currentUserData && currentUserData.currentRoom && currentUserData.currentRoom !== roomCode) {
        const oldRoomCode = currentUserData.currentRoom;
        socket.leave(oldRoomCode);
        const oldRoom = rooms.get(oldRoomCode);
        if (oldRoom) {
          oldRoom.users.delete(socket.id);
          const oldRoomUserCount = oldRoom.users.size;
          if (oldRoomUserCount === 0) {
            rooms.delete(oldRoomCode);
            console.log(`[Leave Room] Room ${oldRoomCode} deleted from memory as it became empty.`);
            deleteChatHistory(oldRoomCode);
          } else {
            socket.to(oldRoomCode).emit("user-left", { userId: socket.id, username: currentUserData.username, userCount: oldRoomUserCount });
          }
        }
        console.log(`[Leave Room] User ${socket.id} (${username}) left room ${oldRoomCode}`);
      }
      let roomData = rooms.get(roomCode);
      let isNewRoom = false;
      if (!roomData) {
        roomData = createRoom(socket, roomCode, level, username, rooms, users, getRandomQuestion);
        if (!roomData) {
          console.error(`[Join Room] Failed to create room ${roomCode} for user ${socket.id}`);
          return;
        }
        isNewRoom = true;
      } else {
        socket.join(roomCode);
        roomData.users.set(socket.id, username);
        users[socket.id] = { username, currentRoom: roomCode };
        console.log(`[Join Room] User ${socket.id} (${username}) joined existing room ${roomCode}`);
      }
      const userCount = roomData.users.size;
      if (!isNewRoom) {
        socket.to(roomCode).emit("user-joined", { userId: socket.id, username, userCount });
      }
      let chatHistory: any[] = [];
      try {
        const messagesRef = db.collection('rooms').doc(roomCode).collection('messages');
        const snapshot = await messagesRef.orderBy('timestamp', 'asc').limit(50).get();
        snapshot.forEach(doc => {
          const data = doc.data();
          chatHistory.push({ id: doc.id, text: data.text, senderId: data.senderId, senderName: data.senderName, timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : null });
        });
      } catch (error) { console.error(`[Chat History] Error fetching for room ${roomCode}:`, error); }
      socket.emit("room-joined", { roomCode, question: roomData.question, userCount, chatHistory });
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
      callAdminTimestamps.delete(socket.id); // <--- Xóa khi disconnect
      console.log(`User disconnected: ${socket.id}. Cleared call admin timestamp.`);
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
        callAdminTimestamps.delete(socket.id); // <--- Xóa khi chủ động rời phòng
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