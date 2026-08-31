from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product
from app.schemas import ProductOut

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(collection: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Product)
    if collection:
        query = query.filter(Product.collection == collection)
    return query.order_by(Product.id.desc()).all()
