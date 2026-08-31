from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ClientRegister(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    phone: Optional[str] = None


class ClientLogin(BaseModel):
    email: EmailStr
    password: str


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: Optional[str] = None
    bonus_balance: int
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    client: ClientOut


class BonusEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    amount: int
    reason: str
    created_at: datetime


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str] = None
    price: float
    collection: Optional[str] = None
    image_url: Optional[str] = None
    in_stock: bool


class ProductCreate(BaseModel):
    title: str
    description: Optional[str] = None
    price: float
    collection: Optional[str] = None
    image_url: Optional[str] = None
    in_stock: bool = True


class OrderCreate(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1)
    comment: Optional[str] = None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    product_id: int
    quantity: int
    status: str
    comment: Optional[str] = None
    created_at: datetime
    product: ProductOut


class OrderStatusUpdate(BaseModel):
    status: str
