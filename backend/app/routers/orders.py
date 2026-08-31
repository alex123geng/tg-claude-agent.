import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app import yandex_sync
from app.database import get_db
from app.deps import get_current_client
from app.models import Client, Order, Product
from app.schemas import OrderCreate, OrderOut

logger = logging.getLogger("orders")
router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == payload.product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Товар не найден")
    if not product.in_stock:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Товара нет в наличии")

    order = Order(
        client_id=client.id,
        product_id=product.id,
        quantity=payload.quantity,
        comment=payload.comment,
        status="new",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    order = (
        db.query(Order)
        .options(joinedload(Order.product), joinedload(Order.client))
        .filter(Order.id == order.id)
        .first()
    )

    try:
        yandex_sync.append_order(order)
    except Exception:
        logger.exception("Не удалось синхронизировать заявку #%s с Яндекс.Диском", order.id)

    return order
