import React from "react";

export default function ChatMessage({ msg, socketId, formatTime, handleOpenImage }) {
  const isSelf = msg.senderId === socketId;

  return (
    <div className={`flex flex-col ${isSelf ? "items-end" : "items-start"}`}>
      <div
        className={`px-2.5 py-1 rounded-lg max-w-[90%] break-words shadow-sm ${
          isSelf ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"
        }`}
      >
        {/* Tên người gửi (nếu không phải mình) */}
        {!isSelf && (
          <span className="font-semibold text-xs block opacity-80 mb-0.5">
            {msg.senderName || "Someone"}
          </span>
        )}

        {/* Nội dung tin nhắn (text hoặc ảnh) */}
        {msg.imageUrl ? (
          <img
            src={msg.imageUrl}
            alt="Đính kèm"
            className="rounded-lg max-w-full max-h-64 border mt-1"
            onClick={() => handleOpenImage(msg.imageUrl)}
          />
        ) : (
          <span className="text-sm">{msg.text}</span>
        )}

        {/* Thời gian */}
        <span className="text-[10px] opacity-70 block text-right mt-0.5">
          {formatTime(msg.timestamp)}
        </span>
      </div>
    </div>
  );
}
