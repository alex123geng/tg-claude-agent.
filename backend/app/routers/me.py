from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_client
from app.models import BonusEvent, Client, Order
from app.schemas import BonusEventOut, ClientOut, ClientUpdate, OrderOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=ClientOut)
def get_me(client: Client = Depends(get_current_client)):
    return client


@router.patch("", response_model=ClientOut)
def update_me(
    payload: ClientUpdate,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    if payload.name is not None:
        client.name = payload.name
    if payload.phone is not None:
        client.phone = payload.phone
    db.commit()
    db.refresh(client)
    return client


@router.get("/bonuses", response_model=list[BonusEventOut])
def get_my_bonuses(
    client: Client = Depends(get_current_client), db: Session = Depends(get_db)
):
    return (
        db.query(BonusEvent)
        .filter(BonusEvent.client_id == client.id)
        .order_by(BonusEvent.created_at.desc())
        .all()
    )


@router.get("/orders", response_model=list[OrderOut])
def get_my_orders(
    client: Client = Depends(get_current_client), db: Session = Depends(get_db)
):
    return (
        db.query(Order)
        .options(joinedload(Order.product))
        .filter(Order.client_id == client.id)
        .order_by(Order.created_at.desc())
        .all()
    )
