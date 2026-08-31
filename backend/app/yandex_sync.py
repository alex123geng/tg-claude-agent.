"""Синхронизация заявок и бонусных событий с таблицами на Яндекс.Диске.

У Яндекс.Таблиц нет публичного API для программной записи строк, поэтому мы
работаем напрямую с .xlsx-файлами через Yandex Disk REST API: скачиваем
существующий файл (или создаём новый с заголовками), дописываем строку(и)
через openpyxl и заливаем файл обратно.

Синхронизация полностью необязательна: если переменная окружения
YANDEX_DISK_TOKEN не задана, все функции в этом модуле тихо ничего не делают.
Любая ошибка синхронизации логируется в консоль и никогда не должна приводить
к ошибке основного запроса клиента — вызывающий код оборачивает обращения
сюда в try/except.
"""

from __future__ import annotations

import io
import logging

import requests
from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from app.config import YANDEX_DISK_TOKEN
from app.models import BonusEvent, Order

logger = logging.getLogger("yandex_sync")

API_BASE = "https://cloud-api.yandex.net/v1/disk/resources"
FOLDER_PATH = "/brand-cabinet"
ORDERS_PATH = f"{FOLDER_PATH}/orders.xlsx"
BONUSES_PATH = f"{FOLDER_PATH}/bonuses.xlsx"

ORDERS_HEADERS = [
    "ID заявки",
    "ID клиента",
    "Email клиента",
    "Товар",
    "Количество",
    "Статус",
    "Комментарий",
    "Создана",
]
BONUSES_HEADERS = [
    "ID события",
    "ID клиента",
    "Email клиента",
    "Сумма",
    "Причина",
    "Создано",
]


def is_enabled() -> bool:
    return bool(YANDEX_DISK_TOKEN)


def _headers() -> dict:
    return {"Authorization": f"OAuth {YANDEX_DISK_TOKEN}"}


def _ensure_folder() -> None:
    resp = requests.put(API_BASE, headers=_headers(), params={"path": FOLDER_PATH}, timeout=15)
    if resp.status_code not in (201, 409):
        resp.raise_for_status()


def _download_workbook(path: str, headers_row: list[str]) -> Workbook:
    resp = requests.get(
        f"{API_BASE}/download", headers=_headers(), params={"path": path}, timeout=15
    )
    if resp.status_code == 200:
        href = resp.json()["href"]
        file_resp = requests.get(href, timeout=30)
        file_resp.raise_for_status()
        return load_workbook(io.BytesIO(file_resp.content))

    # Файла ещё нет на Диске — создаём новую книгу с заголовками.
    wb = Workbook()
    ws = wb.active
    ws.append(headers_row)
    return wb


def _upload_workbook(path: str, wb: Workbook) -> None:
    _ensure_folder()
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    resp = requests.get(
        f"{API_BASE}/upload",
        headers=_headers(),
        params={"path": path, "overwrite": "true"},
        timeout=15,
    )
    resp.raise_for_status()
    href = resp.json()["href"]

    put_resp = requests.put(href, data=buffer.getvalue(), timeout=30)
    put_resp.raise_for_status()


def _order_row(order: Order) -> list:
    return [
        order.id,
        order.client_id,
        order.client.email if order.client else "",
        order.product.title if order.product else "",
        order.quantity,
        order.status,
        order.comment or "",
        order.created_at.isoformat() if order.created_at else "",
    ]


def _bonus_row(event: BonusEvent) -> list:
    return [
        event.id,
        event.client_id,
        event.client.email if event.client else "",
        event.amount,
        event.reason,
        event.created_at.isoformat() if event.created_at else "",
    ]


def append_order(order: Order) -> None:
    """Дописывает одну заявку в orders.xlsx на Яндекс.Диске."""
    if not is_enabled():
        return
    wb = _download_workbook(ORDERS_PATH, ORDERS_HEADERS)
    wb.active.append(_order_row(order))
    _upload_workbook(ORDERS_PATH, wb)


def append_bonus_event(event: BonusEvent) -> None:
    """Дописывает одно бонусное событие в bonuses.xlsx на Яндекс.Диске."""
    if not is_enabled():
        return
    wb = _download_workbook(BONUSES_PATH, BONUSES_HEADERS)
    wb.active.append(_bonus_row(event))
    _upload_workbook(BONUSES_PATH, wb)


def full_resync(db: Session) -> dict:
    """Полностью пересобирает orders.xlsx и bonuses.xlsx из текущего состояния БД.

    Полезно, если синхронизация была подключена не с первого дня и нужно
    залить в таблицы всю накопленную историю разом.
    """
    if not is_enabled():
        return {"synced": False, "reason": "YANDEX_DISK_TOKEN не задан"}

    orders: list[Order] = db.query(Order).order_by(Order.id).all()
    events: list[BonusEvent] = db.query(BonusEvent).order_by(BonusEvent.id).all()

    orders_wb = Workbook()
    orders_ws = orders_wb.active
    orders_ws.append(ORDERS_HEADERS)
    for order in orders:
        orders_ws.append(_order_row(order))
    _upload_workbook(ORDERS_PATH, orders_wb)

    bonuses_wb = Workbook()
    bonuses_ws = bonuses_wb.active
    bonuses_ws.append(BONUSES_HEADERS)
    for event in events:
        bonuses_ws.append(_bonus_row(event))
    _upload_workbook(BONUSES_PATH, bonuses_wb)

    return {
        "synced": True,
        "orders_count": len(orders),
        "bonus_events_count": len(events),
    }
