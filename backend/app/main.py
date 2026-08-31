from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import admin, auth, me, orders, products

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Brand Loyalty Cabinet API")

# TODO: перед продакшеном сузить allow_origins до конкретного домена фронтенда
# (например, https://your-frontend.up.railway.app) вместо "*".
# allow_credentials=False, т.к. авторизация идёт через JWT в заголовке Authorization,
# а не через cookies — с ["*"] его всё равно нельзя включить (запрещено спецификацией CORS).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(admin.router)


@app.get("/")
def health_check():
    return {"status": "ok"}
