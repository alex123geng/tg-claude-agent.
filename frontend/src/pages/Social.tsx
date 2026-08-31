import { Globe, Instagram, MessageCircle, Send, Youtube } from "lucide-react";

import { Layout } from "../components/Layout";

// TODO: заменить плейсхолдеры на реальные ссылки соцсетей бренда.
const SOCIAL_LINKS = [
  { id: "instagram", label: "Instagram", url: "https://instagram.com/your-brand", icon: Instagram },
  { id: "telegram", label: "Telegram", url: "https://t.me/your-brand", icon: Send },
  { id: "whatsapp", label: "WhatsApp", url: "https://wa.me/70000000000", icon: MessageCircle },
  { id: "youtube", label: "YouTube", url: "https://youtube.com/@your-brand", icon: Youtube },
  { id: "website", label: "Сайт бренда", url: "https://your-brand.example", icon: Globe },
];

export default function Social() {
  return (
    <Layout title="Мы в соцсетях">
      <div className="space-y-3">
        {SOCIAL_LINKS.map(({ id, label, url, icon: Icon }) => (
          <a
            key={id}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm active:scale-[0.98]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent">
              <Icon size={22} />
            </div>
            <span className="text-sm font-medium text-brand">{label}</span>
          </a>
        ))}
      </div>
    </Layout>
  );
}
