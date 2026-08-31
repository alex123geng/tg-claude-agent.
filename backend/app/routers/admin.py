import logging
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app import yandex_sync
from app.config import CASHBACK_PERCENT
from app.database import get_db
from app.deps import verify_admin_key
from app.models import BonusEvent, Order, Product
from app.schemas import OrderOut, OrderStatusUpdate, ProductCreate, ProductOut

logger = logging.getLogger("admin")
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(verify_admin_key)])


@router.get("/orders", response_model=list[OrderOut])
def list_all_orders(db: Session = Depends(get_db)):
    return (
        db.query(Order)
        .options(joinedload(Order.product))
        .order_by(Order.created_at.desc())
        .all()
    )


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
def update_order_status(order_id: int, payload: OrderStatusUpdate, db: Session = Depends(get_db)):
    if payload.status not in Order.STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недопустимый статус. Разрешены: {', '.join(Order.STATUSES)}",
        )

    order = (
        db.query(Order)
        .options(joinedload(Order.product), joinedload(Order.client))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Заявка не найдена")

    was_done = order.status == "done"
    order.status = payload.status
    db.commit()
    db.refresh(order)

    # Начисляем кэшбэк один раз, в момент перехода заявки в статус "done".
    if payload.status == "done" and not was_done:
        cashback = math.floor(order.product.price * order.quantity * CASHBACK_PERCENT / 100)
        if cashback > 0:
            order.client.bonus_balance += cashback
            bonus_event = BonusEvent(
                client_id=order.client_id,
                amount=cashback,
                reason=f"Кэшбэк за заказ #{order.id}",
            )
            db.add(bonus_event)
            db.commit()
            db.refresh(bonus_event)

            try:
                yandex_sync.append_bonus_event(bonus_event)
            except Exception:
                logger.exception(
                    "Не удалось синхронизировать кэшбэк по заказу #%s с Яндекс.Диском", order.id
                )

    try:
        yandex_sync.append_order(order)
    except Exception:
        logger.exception("Не удалось синхронизировать заявку #%s с Яндекс.Диском", order.id)

    return order


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.post("/sync-all")
def sync_all(db: Session = Depends(get_db)):
    try:
        result = yandex_sync.full_resync(db)
    except Exception:
        logger.exception("Не удалось выполнить полную синхронизацию с Яндекс.Диском")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Не удалось синхронизировать данные с Яндекс.Диском",
        )
    return result
