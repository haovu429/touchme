// touchme/frontend/src/components/SystemChatMessage.jsx
import React, { useState } from "react";

const MAX_PREVIEW_LENGTH = 50; // Số ký tự tối đa hiển thị preview

function SystemChatMessage({ msg, formatTime }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Hàm rút gọn text
  const truncate = (text, length) => {
    if (!text) return "";
    return text.length > length ? text.substring(0, length) + "..." : text;
  };

  const truncatedQuestion = truncate(msg.questionContent, MAX_PREVIEW_LENGTH);
  // Kiểm tra xem có cần nút xem thêm không
  const needsExpansion =
    msg.questionContent && msg.questionContent.length > MAX_PREVIEW_LENGTH;

  return (
    // Container cho cả tin nhắn hệ thống, căn giữa
    <div className="w-full my-1.5 text-center">
      {/* Box chứa nội dung, màu nền và padding */}
      <div className="inline-block px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs italic shadow-sm border border-gray-200">
        {/* Dòng 1: Ai yêu cầu */}
        <span className="block text-gray-700 font-medium">{msg.text}</span>

        {/* Dòng 2: Preview câu hỏi và nút Expand/Collapse */}
        <div
          className={`flex items-center justify-center gap-1 mt-1 ${
            needsExpansion ? "cursor-pointer" : ""
          }`}
          onClick={
            needsExpansion ? () => setIsExpanded(!isExpanded) : undefined
          }
        >
          {/* Dùng dấu ngoặc kép hoặc ký tự khác để bao bọc câu hỏi preview */}
          <span className="text-gray-800">“{truncatedQuestion}”</span>
          {needsExpansion && (
            <span
              className="ml-1 text-blue-500 hover:text-blue-700 text-sm leading-none font-semibold"
              title={isExpanded ? "Ẩn bớt" : "Xem thêm"}
            >
              {isExpanded ? "▲" : "▼"}
            </span>
          )}
        </div>

        {/* Dòng 3: Nội dung câu hỏi đầy đủ (hiển thị có điều kiện) */}
        {isExpanded && needsExpansion && (
          <div className="mt-1.5 text-left text-gray-800 font-normal border-t border-gray-300 pt-1 italic">
            {msg.questionContent}
          </div>
        )}

        {/* Dòng 4: Thời gian */}
        <span className="block text-right text-[10px] opacity-75 mt-1">
          ({formatTime(msg.timestamp)})
        </span>
      </div>
    </div>
  );
}

export default SystemChatMessage;
