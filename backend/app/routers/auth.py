import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import yandex_sync
from app.config import WELCOME_BONUS
from app.database import get_db
from app.models import BonusEvent, Client
from app.schemas import ClientLogin, ClientRegister, TokenOut
from app.security import create_access_token, hash_password, verify_password

logger = logging.getLogger("auth")
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: ClientRegister, db: Session = Depends(get_db)):
    existing = db.query(Client).filter(Client.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email уже занят")

    client = Client(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        hashed_password=hash_password(payload.password),
        bonus_balance=WELCOME_BONUS,
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    welcome_event = BonusEvent(
        client_id=client.id,
        amount=WELCOME_BONUS,
        reason="Приветственный бонус за регистрацию",
    )
    db.add(welcome_event)
    db.commit()
    db.refresh(welcome_event)

    try:
        yandex_sync.append_bonus_event(welcome_event)
    except Exception:
        logger.exception("Не удалось синхронизировать приветственный бонус с Яндекс.Диском")

    token = create_access_token(subject=client.email)
    return TokenOut(access_token=token, client=client)


@router.post("/login", response_model=TokenOut)
def login(payload: ClientLogin, db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.email == payload.email).first()
    if not client or not verify_password(payload.password, client.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный email или пароль"
        )

    token = create_access_token(subject=client.email)
    return TokenOut(access_token=token, client=client)
