import { Gift, MessageCircle, ShoppingBag, Sparkles, User } from "lucide-react";
import { Link } from "react-router-dom";

import { Layout } from "../components/Layout";
import { useAuth } from "../context/AuthContext";

const quickLinks = [
  { to: "/catalog", label: "Каталог", icon: ShoppingBag },
  { to: "/bonuses", label: "Мои бонусы", icon: Gift },
  { to: "/content", label: "Контент бренда", icon: Sparkles },
  { to: "/social", label: "Соцсети", icon: MessageCircle },
  { to: "/profile", label: "Профиль", icon: User },
];

export default function Dashboard() {
  const { client } = useAuth();

  return (
    <Layout title="Главная">
      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-500">Здравствуйте,</p>
          <p className="text-2xl font-semibold text-brand">{client?.name ?? "..."}</p>
        </div>

        <div className="rounded-2xl bg-brand p-5 text-white">
          <p className="text-sm text-white/70">Баланс бонусов</p>
          <p className="mt-1 text-4xl font-bold text-brand-accent">
            {client?.bonus_balance ?? 0}
          </p>
          <Link
            to="/bonuses"
            className="mt-4 inline-block text-sm font-medium text-white underline underline-offset-4"
          >
            История начислений →
          </Link>
        </div>

        {/* TODO: подключить реальный баннер акции вместо заглушки */}
        <div className="rounded-2xl border border-dashed border-brand-accent/50 bg-brand-accent/10 p-4">
          <p className="text-sm font-medium text-brand">Специальное предложение</p>
          <p className="mt-1 text-sm text-gray-600">
            Здесь появится информация о текущей акции бренда.
          </p>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-gray-500">Разделы</p>
          <div className="grid grid-cols-2 gap-3">
            {quickLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white p-5 text-center shadow-sm transition active:scale-95"
              >
                <Icon size={24} className="text-brand-accent" />
                <span className="text-sm font-medium text-brand">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
