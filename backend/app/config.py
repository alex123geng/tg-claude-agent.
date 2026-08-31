import os

from dotenv import load_dotenv

load_dotenv()

# Railway's managed Postgres exposes DATABASE_URL with the "postgres://" scheme,
# but SQLAlchemy 2.0 requires "postgresql://". Falls back to a local SQLite file
# when DATABASE_URL is not set, so the app runs out of the box in local dev.
_raw_database_url = os.getenv("DATABASE_URL")
if _raw_database_url:
    DATABASE_URL = _raw_database_url.replace("postgres://", "postgresql://", 1)
else:
    DATABASE_URL = "sqlite:///./local.db"

# TODO: replace with a strong random string in production (Railway env var SECRET_KEY).
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days

# TODO: replace with a strong random string in production (Railway env var ADMIN_KEY).
# Protects the /admin/* endpoints via a `key` query parameter.
ADMIN_KEY = os.getenv("ADMIN_KEY", "")

# Bonus program constants. TODO: tune these to the real loyalty program rules.
WELCOME_BONUS = int(os.getenv("WELCOME_BONUS", "100"))
CASHBACK_PERCENT = float(os.getenv("CASHBACK_PERCENT", "5"))

# Optional: Yandex Disk OAuth token used for spreadsheet sync. If unset, sync is a no-op.
YANDEX_DISK_TOKEN = os.getenv("YANDEX_DISK_TOKEN", "")
