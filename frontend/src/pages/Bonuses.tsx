import { useEffect, useState } from "react";

import { ApiError, NetworkError, api } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";
import { Layout } from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import type { BonusEvent } from "../types";

export default function Bonuses() {
  const { client } = useAuth();
  const [events, setEvents] = useState<BonusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BonusEvent[]>("/me/bonuses")
      .then(setEvents)
      .catch((err) => {
        if (err instanceof ApiError || err instanceof NetworkError) {
          setError(err.message);
        } else {
          setError("Не удалось загрузить историю бонусов.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Мои бонусы">
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}

        <div className="rounded-2xl bg-brand p-5 text-white">
          <p className="text-sm text-white/70">Текущий баланс</p>
          <p className="mt-1 text-4xl font-bold text-brand-accent">
            {client?.bonus_balance ?? 0}
          </p>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-gray-500">История</p>
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Загрузка...</p>
          ) : events.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">Пока нет начислений</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-medium text-brand">{event.reason}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(event.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      event.amount >= 0 ? "text-green-600" : "text-red-500"
                    }`}
                  >
                    {event.amount >= 0 ? "+" : ""}
                    {event.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
