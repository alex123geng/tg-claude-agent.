# Личный кабинет клиента бренда

Веб-приложение — личный кабинет клиента бренда с программой лояльности:
оформление заявок на товары, накопление и списание бонусов, каталог и
коллекции товаров, контент бренда и ссылки на соцсети.

> В корне репозитория также лежит небольшой отдельный Telegram-бот
> (`bot.js`, `package.json`) — он не связан с этим приложением и не
> используется при деплое личного кабинета.

## Структура проекта

Монорепозиторий с двумя независимыми сервисами — это позволяет развернуть
backend и frontend как отдельные сервисы Railway из одного репозитория.

```
.
├── backend/                 # FastAPI + SQLAlchemy + PostgreSQL
│   ├── app/
│   │   ├── main.py          # точка входа FastAPI, CORS, роуты
│   │   ├── config.py        # переменные окружения и константы
│   │   ├── database.py      # подключение к БД (Postgres/SQLite)
│   │   ├── models.py        # Client, Product, Order, BonusEvent
│   │   ├── schemas.py       # Pydantic-схемы запросов/ответов
│   │   ├── security.py      # хеширование паролей, JWT
│   │   ├── deps.py          # авторизация клиента / admin-ключ
│   │   ├── yandex_sync.py   # синхронизация с Яндекс.Диском
│   │   └── routers/         # auth, me, products, orders, admin
│   ├── requirements.txt
│   ├── railway.json
│   └── .env.example
│
└── frontend/                 # React + TypeScript + Vite + Tailwind
    ├── src/
    │   ├── api/client.ts     # обёртка над fetch с JWT
    │   ├── context/AuthContext.tsx
    │   ├── components/       # Layout, BottomNav, OrderModal, ...
    │   ├── pages/             # Register, Login, Dashboard, Catalog,
    │   │                       # Orders, Bonuses, Profile, Content, Social
    │   └── types/
    ├── package.json
    ├── tailwind.config.js
    ├── railway.json
    └── .env.example
```

## Технический стек

- **Backend**: Python, FastAPI, SQLAlchemy 2.0, PostgreSQL (или SQLite
  локально), авторизация email+пароль с bcrypt и JWT.
- **Frontend**: React + TypeScript + Vite + Tailwind CSS, react-router-dom,
  lucide-react. Mobile-first: нижняя навигация на мобильных экранах.
- **Синхронизация с Яндекс.Диском**: заявки и бонусные события дублируются
  в .xlsx-таблицы через Yandex Disk REST API (у Яндекс.Таблиц нет
  публичного API для записи строк).

## Локальный запуск

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # без DATABASE_URL — будет использован SQLite
uvicorn app.main:app --reload
```

API поднимется на `http://localhost:8000`, документация — на `/docs`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:8000
npm run dev
```

## Деплой на Railway

Приложение деплоится как **три сервиса** из одного GitHub-репозитория:
backend, frontend и PostgreSQL.

1. **Запушьте репозиторий в GitHub** (если ещё не сделано).

2. **Создайте новый проект в Railway** → `New Project` → `Deploy from GitHub repo`
   → выберите этот репозиторий.

3. **Добавьте сервис PostgreSQL**: в проекте нажмите `+ New` → `Database` →
   `Add PostgreSQL`. Railway создаст базу и переменную `DATABASE_URL`
   автоматически внутри самого Postgres-сервиса.

4. **Настройте backend-сервис**:
   - `+ New` → `GitHub Repo` → тот же репозиторий.
   - В `Settings` → `Root Directory` укажите `backend`.
   - Railway автоматически найдёт `backend/railway.json` (Nixpacks,
     `uvicorn app.main:app --host 0.0.0.0 --port $PORT`).
   - В `Variables` добавьте переменные окружения (см. таблицу ниже).
   - В `Settings` → `Networking` включите `Generate Domain`, чтобы получить
     публичный URL backend-а — он понадобится для `VITE_API_URL` фронтенда.

5. **Настройте frontend-сервис**:
   - `+ New` → `GitHub Repo` → тот же репозиторий.
   - В `Settings` → `Root Directory` укажите `frontend`.
   - Railway найдёт `frontend/railway.json` (сборка Vite,
     `npm run preview -- --host --port $PORT`).
   - В `Variables` добавьте `VITE_API_URL` со значением публичного домена
     backend-сервиса (из шага 4), например `https://backend-production-xxxx.up.railway.app`.
   - Включите `Generate Domain` для самого frontend-сервиса, чтобы получить
     публичную ссылку на личный кабинет.

### Переменные окружения

**Backend** (`backend/.env.example`):

| Переменная | Откуда взять |
|---|---|
| `DATABASE_URL` | В backend-сервисе: `Variables` → `+ New Variable` → `Add Reference` → выбрать Postgres-сервис → `DATABASE_URL`. Так значение всегда синхронизировано с реальной базой. |
| `SECRET_KEY` | Любая случайная длинная строка (например, сгенерированная через `openssl rand -hex 32`). |
| `ADMIN_KEY` | Любая случайная строка — секрет для доступа к `/admin/*` эндпоинтам. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Необязательно, по умолчанию 10080 (7 дней). |
| `WELCOME_BONUS` | Необязательно, по умолчанию 100. |
| `CASHBACK_PERCENT` | Необязательно, по умолчанию 5. |
| `YANDEX_DISK_TOKEN` | Получить на [oauth.yandex.ru](https://oauth.yandex.ru) — создать приложение с правом «Запись в любом месте на Диске» (`cloud_api:disk.write`), авторизоваться и скопировать OAuth-токен. Если не задан — синхронизация с Диском просто отключена, остальное приложение работает как обычно. |

**Frontend** (`frontend/.env.example`):

| Переменная | Откуда взять |
|---|---|
| `VITE_API_URL` | Публичный домен backend-сервиса на Railway (шаг 4 выше). |

## Первичное наполнение каталога

Эндпоинт `POST /admin/products?key=<ADMIN_KEY>` позволяет добавлять товары
напрямую через API (например, через `curl` или Postman) — отдельного UI для
админки в MVP нет.

Если синхронизация с Яндекс.Диском была подключена не с первого дня,
`POST /admin/sync-all?key=<ADMIN_KEY>` пересоберёт таблицы `orders.xlsx` и
`bonuses.xlsx` из всей истории, накопленной в базе.

## Что дальше

MVP закрывает базовый сценарий личного кабинета. Дальнейшие направления
развития:

- **Уровни программы лояльности** — разные ставки кэшбэка и привилегии в
  зависимости от суммы покупок/статуса клиента.
- **Реферальная программа** — бонусы за приглашённых друзей.
- **Push/email-уведомления** — об изменении статуса заявки, начислении
  бонусов, новых акциях.
- **Админ-панель с UI** — сейчас управление заявками и товарами доступно
  только через API с `ADMIN_KEY`.
- **Пагинация** — списки заявок, бонусов и товаров сейчас отдаются целиком.
- **Хранение изображений** — сейчас `image_url` — это просто ссылка; для
  реального использования потребуется загрузка файлов (S3-совместимое
  хранилище и т.п.).

## Что нужно донастроить после генерации

Список TODO, оставленных в коде — их нужно заменить реальными значениями:

- `frontend/tailwind.config.js` — цвета `brand` (`#111827`) и
  `brand.accent` (`#f59e0b`) заменить на фирменные цвета бренда.
- `frontend/src/pages/Content.tsx` — константа `CONTENT_ITEMS` захардкожена
  заглушками, заменить на реальный контент бренда (или подключить к CMS/API).
- `frontend/src/pages/Social.tsx` — константа `SOCIAL_LINKS` содержит
  плейсхолдеры ссылок на соцсети, заменить на реальные.
- `frontend/src/pages/Dashboard.tsx` — баннер «Специальное предложение» —
  заглушка, заменить на реальную акцию бренда (текст/картинку/логику показа).
- `backend/app/config.py` — значения по умолчанию `WELCOME_BONUS` (100) и
  `CASHBACK_PERCENT` (5%) — уточнить реальные условия программы лояльности.
- `backend/app/main.py` — CORS сейчас разрешён с любого домена
  (`allow_origins=["*"]`), перед продакшеном сузить до домена фронтенда.
- Переменные окружения `SECRET_KEY`, `ADMIN_KEY`, `YANDEX_DISK_TOKEN` — на
  Railway их нужно сгенерировать/получить самостоятельно (см. таблицу выше).
