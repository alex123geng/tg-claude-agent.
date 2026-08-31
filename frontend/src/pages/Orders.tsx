import { useEffect, useState } from "react";

import { ApiError, NetworkError, api } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";
import { Layout } from "../components/Layout";
import type { Order, OrderStatus } from "../types";

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новая",
  processing: "В обработке",
  confirmed: "Подтверждена",
  shipped: "Отправлена",
  done: "Выполнена",
  cancelled: "Отменена",
};

const STATUS_STYLES: Record<OrderStatus, string> = {
  new: "bg-gray-100 text-gray-600",
  processing: "bg-blue-100 text-blue-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  shipped: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Order[]>("/me/orders")
      .then(setOrders)
      .catch((err) => {
        if (err instanceof ApiError || err instanceof NetworkError) {
          setError(err.message);
        } else {
          setError("Не удалось загрузить заявки.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Мои заявки">
      <div className="space-y-3">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Загрузка...</p>
        ) : orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            Заявок пока нет — загляните в каталог
          </p>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-brand">{order.product.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {order.quantity} шт. ·{" "}
                    {(order.product.price * order.quantity).toLocaleString("ru-RU")} ₽
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[order.status]}`}
                >
                  {STATUS_LABELS[order.status]}
                </span>
              </div>
              {order.comment && (
                <p className="mt-2 text-xs text-gray-500">Комментарий: {order.comment}</p>
              )}
              <p className="mt-2 text-xs text-gray-400">
                {new Date(order.created_at).toLocaleString("ru-RU")}
              </p>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
