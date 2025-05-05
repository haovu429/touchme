// touchme/frontend/src/components/SystemChatMessage.jsx (Đã đổi màu)
import React, { useState } from "react";

const MAX_PREVIEW_LENGTH = 50; // Số ký tự tối đa hiển thị preview

function SystemChatMessage({ msg, formatTime }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const truncate = (text, length) => {
    if (!text) return "";
    return text.length > length ? text.substring(0, length) + "..." : text;
  };

  const hasQuestionContent =
    msg.questionContent && typeof msg.questionContent === "string";
  const truncatedQuestion = hasQuestionContent
    ? truncate(msg.questionContent, MAX_PREVIEW_LENGTH)
    : "";
  const needsExpansion =
    hasQuestionContent && msg.questionContent.length > MAX_PREVIEW_LENGTH;

  return (
    <div className="w-full my-1.5 text-center">
      {/* === THAY ĐỔI MÀU SẮC Ở ĐÂY === */}
      <div className="inline-block px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs italic shadow-sm border border-purple-200">
        {/* Dòng 1: Nội dung thông báo chính (VD: Ai yêu cầu) */}
        {/* Đổi màu chữ đậm hơn chút */}
        <span className="block text-purple-800 font-medium">{msg.text}</span>

        {/* Dòng 2: Preview câu hỏi và nút Expand (nếu có) */}
        {hasQuestionContent && (
          <div
            className={`flex items-center justify-center gap-1 mt-1 ${
              needsExpansion ? "cursor-pointer" : ""
            }`}
            onClick={
              needsExpansion ? () => setIsExpanded(!isExpanded) : undefined
            }
          >
            {/* Đổi màu chữ preview */}
            <span className="text-purple-900">“{truncatedQuestion}”</span>
            {needsExpansion && (
              <span
                className="ml-1 text-purple-600 hover:text-purple-800 text-sm leading-none font-semibold" // Giữ màu nút
                title={isExpanded ? "Ẩn bớt" : "Xem thêm"}
              >
                {isExpanded ? "▲" : "▼"}
              </span>
            )}
          </div>
        )}

        {/* Dòng 3: Nội dung câu hỏi đầy đủ */}
        {isExpanded && needsExpansion && (
          <div className="mt-1.5 text-left text-purple-900 font-normal border-t border-purple-300 pt-1 italic">
            {" "}
            {/* Đổi màu border */}
            {msg.questionContent}
          </div>
        )}

        {/* Dòng 4: Thời gian */}
        <span className="block text-right text-purple-600 text-[10px] opacity-90 mt-1">
          {" "}
          {/* Đổi màu timestamp */}({formatTime(msg.timestamp)})
        </span>
      </div>
      {/* ============================== */}
    </div>
  );
}

export default SystemChatMessage;
