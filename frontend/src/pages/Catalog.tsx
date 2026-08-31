import { useEffect, useMemo, useState } from "react";

import { ApiError, NetworkError, api } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";
import { Layout } from "../components/Layout";
import { OrderModal } from "../components/OrderModal";
import type { Product } from "../types";

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [collection, setCollection] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadProducts(currentCollection: string) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Product[]>("/products", {
        collection: currentCollection || undefined,
      });
      setProducts(data);
    } catch (err) {
      if (err instanceof ApiError || err instanceof NetworkError) {
        setError(err.message);
      } else {
        setError("Не удалось загрузить каталог.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts(collection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);

  const collections = useMemo(() => {
    const all = new Set<string>();
    for (const p of products) {
      if (p.collection) all.add(p.collection);
    }
    return Array.from(all);
  }, [products]);

  return (
    <Layout title="Каталог">
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}
        {successMessage && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {collections.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <button
              onClick={() => setCollection("")}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${
                collection === "" ? "bg-brand text-white" : "bg-white text-gray-600"
              }`}
            >
              Все коллекции
            </button>
            {collections.map((c) => (
              <button
                key={c}
                onClick={() => setCollection(c)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm ${
                  collection === c ? "bg-brand text-white" : "bg-white text-gray-600"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Загрузка...</p>
        ) : products.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">Товары не найдены</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((product) => (
              <div key={product.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <div className="aspect-square w-full bg-gray-100">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-300">
                      Нет фото
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-medium text-brand">{product.title}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {product.price.toLocaleString("ru-RU")} ₽
                  </p>
                  <button
                    disabled={!product.in_stock}
                    onClick={() => setSelectedProduct(product)}
                    className="mt-2 w-full rounded-xl bg-brand py-2 text-xs font-medium text-white disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    {product.in_stock ? "Оформить заявку" : "Нет в наличии"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedProduct && (
        <OrderModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSuccess={() => {
            setSelectedProduct(null);
            setSuccessMessage("Заявка отправлена! Следить за статусом можно в разделе «Заявки».");
            setTimeout(() => setSuccessMessage(null), 5000);
          }}
        />
      )}
    </Layout>
  );
}
