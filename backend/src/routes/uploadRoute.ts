import express from "express";
import multer from "multer";
import sharp from "sharp";
import { v2 as cloudinary } from "cloudinary";
import stream from "stream";
import { Request, Response } from "express";

const router = express.Router();

// --- Multer cấu hình: giới hạn 3MB ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});

interface MulterRequest extends Request {
    file?: Express.Multer.File; // <-- thêm dấu `?` để đúng với thực tế
}

// --- Cloudinary cấu hình ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Route chính ---
router.post("/upload-image", upload.single("image"), async (req: MulterRequest, res: Response) => {
    try {
        const file = req.file;
        if (!file) {
            res.status(400).json({ error: "No file uploaded" });
            return;
        }

        // Resize ảnh nếu chiều rộng > 1000px
        const resizedBuffer = await sharp(file.buffer)
            .resize({ width: 1000, withoutEnlargement: true })
            .toFormat("jpeg")
            .jpeg({ quality: 90 })
            .toBuffer();

        // Upload qua stream
        const bufferStream = new stream.PassThrough();
        bufferStream.end(resizedBuffer);

        const cloudinaryUpload = () =>
            new Promise((resolve, reject) => {
                const streamUpload = cloudinary.uploader.upload_stream(
                    { folder: "chat_images" },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                bufferStream.pipe(streamUpload);
            });

        const result: any = await cloudinaryUpload();
        res.status(200).json({
            imageUrl: result.secure_url,
            publicId: result.public_id, // <<< thêm cái này
        });

    } catch (err: any) {
        console.error("Upload error:", err);
        if (err.code === "LIMIT_FILE_SIZE") {
            res.status(400).json({ error: "No file uploaded" });
        }
        res.status(500).json({ error: "Upload failed" });
    }
});

export default router;
