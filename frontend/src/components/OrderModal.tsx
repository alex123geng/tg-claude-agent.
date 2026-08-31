import { X } from "lucide-react";
import { useState } from "react";

import { ApiError, NetworkError, api } from "../api/client";
import type { Order, Product } from "../types";

export function OrderModal({
  product,
  onClose,
  onSuccess,
}: {
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.post<Order>("/orders", { product_id: product.id, quantity, comment });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError || err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError("Не удалось оформить заявку. Попробуйте ещё раз.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 md:rounded-2xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold text-brand">{product.title}</h2>
          <button onClick={onClose} className="text-gray-400" aria-label="Закрыть">
            <X size={22} />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">{product.price.toLocaleString("ru-RU")} ₽ / шт.</p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">Количество</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="h-11 w-11 rounded-xl border border-gray-200 text-lg"
            >
              −
            </button>
            <span className="w-8 text-center text-base font-medium">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="h-11 w-11 rounded-xl border border-gray-200 text-lg"
            >
              +
            </button>
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Комментарий (необязательно)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-brand"
            placeholder="Например, пожелания по размеру или цвету"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-xl bg-brand py-3 text-base font-medium text-white disabled:opacity-60"
        >
          {submitting ? "Отправляем..." : "Оформить заявку"}
        </button>
      </div>
    </div>
  );
}
