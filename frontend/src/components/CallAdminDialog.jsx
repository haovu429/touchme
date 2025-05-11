import React from "react";

export default function CallAdminDialog({ isOpen, onClose, onSubmit }) {
  const [message, setMessage] = React.useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/30 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md mx-auto p-5 rounded-xl shadow-xl animate-fade-in">
        <h2 className="text-xl font-bold mb-3">📞 Gọi Admin</h2>
        <p className="text-sm text-gray-600 mb-2">Bạn cần hỗ trợ điều gì?</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded p-2 text-sm"
          placeholder="Ví dụ: Không thấy câu hỏi, bị lag..."
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-gray-300 text-sm"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              const trimmed = message.trim();
              if (trimmed) {
                onSubmit(trimmed);
                setMessage("");
              }
            }}
            className="px-3 py-1 rounded bg-yellow-500 text-white font-bold text-sm"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
}
