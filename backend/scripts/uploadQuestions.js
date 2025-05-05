// touchme/backend/scripts/uploadQuestions.js

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// --- !!! QUAN TRỌNG: Cấu hình đường dẫn đến Service Account Key !!! ---

// **Cách 1: Dùng biến môi trường GOOGLE_APPLICATION_CREDENTIALS (Khuyến nghị)**
// Trước khi chạy script này trong terminal, bạn cần đặt biến môi trường này:
// Ví dụ trên Linux/macOS: export GOOGLE_APPLICATION_CREDENTIALS="/đường/dẫn/tới/key/cua/ban.json"
// Ví dụ trên Windows (Command Prompt): set GOOGLE_APPLICATION_CREDENTIALS="secrets/touchme-628a9-firebase-adminsdk-fbsvc-d7bf541ea3.json"
// Ví dụ trên Windows (PowerShell): $env:GOOGLE_APPLICATION_CREDENTIALS="secrets/touchme-628a9-firebase-adminsdk-fbsvc-d7bf541ea3.json"
const GOOGLE_APPLICATION_CREDENTIALS = "secrets/touchme-628a9-firebase-adminsdk-fbsvc-d7bf541ea3.json";
try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn("WARNING: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.");
        console.warn("Attempting to use default credentials if available, or specify key path directly in code (less secure).");
        // Nếu không đặt env var, bạn có thể thử cách 2 bên dưới, nhưng không an toàn bằng
    }
     admin.initializeApp({
       credential: admin.credential.applicationDefault() // Tự đọc từ biến môi trường
     });
     console.log("Firebase Admin SDK initialized using Application Default Credentials.");
} catch (sdkError) {
    console.warn("Could not initialize via Application Default Credentials. Trying hardcoded path (ensure file is NOT committed)...", sdkError);
    // **Cách 2: Chỉ định đường dẫn trực tiếp (Ít an toàn hơn - KHÔNG COMMIT FILE KEY)**
    try {
        const serviceAccountPath = "backend/scripts/uploadQuestions.js"; // <<<====== THAY ĐỔI ĐƯỜNG DẪN NÀY
        if (!fs.existsSync(serviceAccountPath)) {
            throw new Error(`Service account key file not found at: ${serviceAccountPath}`);
        }
        const serviceAccount = require(serviceAccountPath);
         admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
         console.log("Firebase Admin SDK initialized using specific key file path.");
    } catch (error) {
         console.error("FATAL: Failed to initialize Firebase Admin SDK. Make sure the path is correct or GOOGLE_APPLICATION_CREDENTIALS is set.", error);
         process.exit(1); // Thoát script nếu không khởi tạo được
    }
}


// --- Đường dẫn đến file questions.json ---
// Giả sử script này nằm trong thư mục backend/scripts/
const jsonFilePath = path.resolve(__dirname, '../src/questions.json');

// --- Lấy đối tượng Firestore ---
const db = admin.firestore();

// --- Hàm thực hiện upload ---
async function uploadQuestionsToFirestore() {
    try {
        // Đọc file JSON cục bộ
        console.log(`Reading questions from: ${jsonFilePath}`);
        if (!fs.existsSync(jsonFilePath)) {
            throw new Error(`Questions JSON file not found at: ${jsonFilePath}`);
        }
        const questionsData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

        // Lấy các key level (level1, level2, level3)
        const levels = Object.keys(questionsData);
        if (levels.length === 0) {
            console.error("No levels found in the JSON file.");
            return;
        }
        console.log(`Found levels: ${levels.join(', ')}`);

        // Sử dụng Batch Write để ghi nhiều document cùng lúc (hiệu quả hơn)
        const batch = db.batch();
        const collectionRef = db.collection('questions'); // Tên collection bạn muốn lưu

        for (const level of levels) {
            const questionsArray = questionsData[level];
            if (!Array.isArray(questionsArray)) {
                console.warn(`Data for level "${level}" is not an array in JSON. Skipping.`);
                continue;
            }

            // Tạo tham chiếu đến document tương ứng với level (ví dụ: questions/level1)
            const docRef = collectionRef.doc(level);

            console.log(`Preparing to set data for document: ${collectionRef.path}/${level} with ${questionsArray.length} items.`);

            // Đặt toàn bộ dữ liệu cho document này.
            // Dữ liệu sẽ có dạng { items: [ { question: 1, ... }, { question: 2, ...} ] }
            // Thao tác này sẽ GHI ĐÈ toàn bộ document nếu nó đã tồn tại.
            batch.set(docRef, { items: questionsArray });
        }

        // Gửi batch lên Firestore
        console.log("Committing batch to Firestore...");
        await batch.commit();
        console.log("Successfully uploaded all question levels to Firestore!");

    } catch (error) {
        console.error("Error during upload process:", error);
    }
}

// Chạy hàm upload
uploadQuestionsToFirestore();