import { LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, NetworkError, api } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";
import { Layout } from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import type { Client } from "../types";

export default function Profile() {
  const { client, logout, updateClientLocally } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(client?.name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      const updated = await api.patch<Client>("/me", { name, phone });
      updateClientLocally(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      if (err instanceof ApiError || err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError("Не удалось сохранить изменения.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <Layout title="Профиль">
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400">Email</p>
          <p className="text-sm font-medium text-brand">{client?.email}</p>
        </div>

        {error && <ErrorBanner message={error} />}
        {success && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Данные сохранены
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Имя</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Телефон</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-brand"
              placeholder="+7 900 000-00-00"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Сохраняем..." : "Сохранить"}
          </button>
        </form>

        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 text-sm font-medium text-red-600"
        >
          <LogOut size={18} />
          Выйти
        </button>
      </div>
    </Layout>
  );
}
