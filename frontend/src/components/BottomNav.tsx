import { Gift, Home, ShoppingBag, User, ClipboardList } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/dashboard", label: "Главная", icon: Home },
  { to: "/catalog", label: "Каталог", icon: ShoppingBag },
  { to: "/orders", label: "Заявки", icon: ClipboardList },
  { to: "/bonuses", label: "Бонусы", icon: Gift },
  { to: "/profile", label: "Профиль", icon: User },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex items-stretch justify-between">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
                isActive ? "text-brand-accent" : "text-gray-400"
              }`
            }
          >
            <Icon size={22} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
