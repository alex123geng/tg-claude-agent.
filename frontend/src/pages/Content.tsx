import { Layout } from "../components/Layout";

// TODO: заменить на реальный контент бренда (например, подтягивать из CMS или отдельного API).
const CONTENT_ITEMS = [
  {
    id: 1,
    title: "Новая коллекция уже в каталоге",
    image: "https://placehold.co/600x400?text=Brand+Content",
    description: "Расскажите здесь о запуске новой коллекции или сезонной линейки товаров.",
    link: "#",
  },
  {
    id: 2,
    title: "Как ухаживать за изделиями",
    image: "https://placehold.co/600x400?text=Brand+Content",
    description: "Полезные советы по уходу за товарами бренда — замените на реальный материал.",
    link: "#",
  },
  {
    id: 3,
    title: "История бренда",
    image: "https://placehold.co/600x400?text=Brand+Content",
    description: "Короткий рассказ о ценностях и истории бренда для ваших клиентов.",
    link: "#",
  },
];

export default function Content() {
  return (
    <Layout title="Контент бренда">
      <div className="space-y-4">
        {CONTENT_ITEMS.map((item) => (
          <a
            key={item.id}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-2xl bg-white shadow-sm"
          >
            <img src={item.image} alt={item.title} className="h-40 w-full object-cover" />
            <div className="p-4">
              <p className="text-sm font-medium text-brand">{item.title}</p>
              <p className="mt-1 text-sm text-gray-500">{item.description}</p>
            </div>
          </a>
        ))}
      </div>
    </Layout>
  );
}
