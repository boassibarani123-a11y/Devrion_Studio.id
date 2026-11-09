import asyncio
import io
import logging
import os
import secrets
import time
import uuid
from collections import OrderedDict, defaultdict
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional

import bcrypt
import jwt
import qrcode
from dotenv import load_dotenv
from fastapi import (APIRouter, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile,
                     WebSocket, WebSocketDisconnect)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel, ReturnDocument
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import storage  # noqa: E402  (needs env loaded)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("devrion")

# Connection pool sized for concurrent load
client = AsyncIOMotorClient(os.environ["MONGO_URL"], maxPoolSize=100, minPoolSize=5)
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_HOURS = int(os.environ["JWT_EXPIRE_HOURS"])

INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("email", ASCENDING)], name="email", unique=True),
              IndexModel([("id", ASCENDING)], name="id", unique=True),
              IndexModel([("restaurant_id", ASCENDING)], name="rid")],
    "restaurants": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "outlets": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("restaurant_id", ASCENDING)], name="rid")],
    "categories": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("restaurant_id", ASCENDING), ("sort", ASCENDING)], name="rid_sort")],
    "menu_items": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("restaurant_id", ASCENDING)], name="rid")],
    "tables": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("code", ASCENDING)], name="code", unique=True),
               IndexModel([("restaurant_id", ASCENDING)], name="rid")],
    "orders": [IndexModel([("id", ASCENDING)], name="id", unique=True),
               IndexModel([("restaurant_id", ASCENDING), ("created_at", DESCENDING)], name="rid_created"),
               IndexModel([("restaurant_id", ASCENDING), ("status", ASCENDING)], name="rid_status")],
    "expenses": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("restaurant_id", ASCENDING), ("date", DESCENDING)], name="rid_date")],
    "files": [IndexModel([("path", ASCENDING)], name="path", unique=True)],
    "login_attempts": [IndexModel([("key", ASCENDING)], name="key", unique=True),
                       IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


NO_ID = {"_id": 0}

app = FastAPI(title="Resto POS API", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")

# ---------------------------------------------------------------- Auth
bearer = HTTPBearer(auto_error=False)
ROLES = ("founder", "admin", "kasir", "dapur")


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def make_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user["id"], "role": user["role"], "iat": now, "exp": now + timedelta(hours=JWT_HOURS)},
                      JWT_SECRET, algorithm="HS256")


async def user_from_token(token: Optional[str]) -> dict:
    if not token:
        raise HTTPException(401, "Sesi tidak valid, silakan login ulang")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Sesi berakhir, silakan login ulang")
    user = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(401, "Akun tidak aktif")
    if user["role"] != "founder":
        resto = await db.restaurants.find_one({"id": user.get("restaurant_id")}, {"_id": 0, "active": 1})
        if not resto or not resto.get("active", True):
            raise HTTPException(401, "Resto sedang dinonaktifkan")
    return user


async def current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    return await user_from_token(cred.credentials if cred else None)


def roles(*allowed):
    async def dep(user=Depends(current_user)):
        if user["role"] not in allowed:
            raise HTTPException(403, "Akses ditolak")
        return user
    return dep


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


MAX_FAILS, LOCK_MIN = 5, 5


@api.post("/auth/login")
async def login(data: LoginIn, request: Request):
    email = data.email.lower()
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    key = f"{email}|{ip}"
    att = await db.login_attempts.find_one({"key": key})
    if att and att.get("count", 0) >= MAX_FAILS:
        raise HTTPException(429, f"Terlalu banyak percobaan. Coba lagi dalam {LOCK_MIN} menit.")
    user = await db.users.find_one({"email": email}, NO_ID)
    if not user or not verify_pw(data.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"key": key}, {"$inc": {"count": 1}, "$set": {"expires_at": datetime.now(timezone.utc) + timedelta(minutes=LOCK_MIN)}},
            upsert=True)
        raise HTTPException(401, "Email atau password salah")
    if not user.get("active", True):
        raise HTTPException(401, "Akun dinonaktifkan")
    resto = None
    if user["role"] != "founder":
        resto = await db.restaurants.find_one({"id": user["restaurant_id"]}, NO_ID)
        if not resto or not resto.get("active", True):
            raise HTTPException(401, "Resto sedang dinonaktifkan oleh pengelola")
    await db.login_attempts.delete_one({"key": key})
    user.pop("password_hash", None)
    return {"token": make_token(user), "user": user}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    resto = None
    outlet = None
    if user.get("restaurant_id"):
        resto = await db.restaurants.find_one({"id": user["restaurant_id"]}, {"_id": 0, "id": 1, "name": 1, "logo_path": 1})
    if user.get("outlet_id"):
        outlet = await db.outlets.find_one({"id": user["outlet_id"]}, NO_ID)
    return {"user": user, "restaurant": resto, "outlet": outlet}


# ---------------------------------------------------------------- Realtime hub (WebSocket)
class Hub:
    def __init__(self):
        self.rooms: dict[str, set] = defaultdict(set)

    async def join(self, rid, ws, outlet_id):
        self.rooms[rid].add((ws, outlet_id))

    def leave(self, rid, ws, outlet_id):
        self.rooms[rid].discard((ws, outlet_id))

    async def emit(self, rid: str, outlet_id: Optional[str], event: dict):
        dead = []
        for ws, oid in list(self.rooms.get(rid, ())):
            if oid and outlet_id and oid != outlet_id:
                continue
            try:
                await ws.send_json(event)
            except Exception:
                dead.append((ws, oid))
        for d in dead:
            self.rooms[rid].discard(d)


hub = Hub()


@api.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str = Query(...)):
    try:
        user = await user_from_token(token)
    except HTTPException:
        await ws.close(code=4401)
        return
    if user["role"] == "founder":
        await ws.close(code=4403)
        return
    await ws.accept()
    rid, oid = user["restaurant_id"], user.get("outlet_id")
    await hub.join(rid, ws, oid)
    try:
        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.leave(rid, ws, oid)


# ---------------------------------------------------------------- Founder
class RestaurantIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    owner_name: str = Field("", max_length=80)
    phone: str = Field("", max_length=30)
    address: str = Field("", max_length=200)
    city: str = Field("", max_length=60)
    admin_email: EmailStr
    admin_password: str = Field(min_length=6, max_length=100)
    admin_name: str = Field("Admin", max_length=80)


class RestaurantPatch(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    active: Optional[bool] = None
    admin_password: Optional[str] = Field(None, min_length=6, max_length=100)


async def create_restaurant_doc(data: RestaurantIn) -> dict:
    if await db.users.find_one({"email": data.admin_email.lower()}):
        raise HTTPException(409, "Email admin sudah terdaftar")
    rid = new_id()
    resto = {"id": rid, "name": data.name, "owner_name": data.owner_name, "phone": data.phone, "address": data.address,
             "city": data.city, "active": True, "logo_path": None, "tagline": "", "qris_enabled": False, "qris_path": None,
             "bank_accounts": [], "admin_email": data.admin_email.lower(), "created_at": now_iso()}
    await db.restaurants.insert_one(dict(resto))
    await db.outlets.insert_one({"id": new_id(), "restaurant_id": rid, "name": "Outlet Utama", "address": data.address,
                                 "created_at": now_iso()})
    await db.users.insert_one({"id": new_id(), "email": data.admin_email.lower(), "password_hash": hash_pw(data.admin_password),
                               "name": data.admin_name, "role": "admin", "restaurant_id": rid, "outlet_id": None,
                               "active": True, "created_at": now_iso()})
    return resto


async def resto_stats(rid: str) -> dict:
    o, s, t, m = await asyncio.gather(
        db.outlets.count_documents({"restaurant_id": rid}),
        db.users.count_documents({"restaurant_id": rid}),
        db.tables.count_documents({"restaurant_id": rid}),
        db.menu_items.count_documents({"restaurant_id": rid}))
    return {"outlets": o, "staff": s, "tables": t, "menu": m}


@api.get("/founder/restaurants")
async def founder_list(_=Depends(roles("founder"))):
    items = await db.restaurants.find({}, {"_id": 0, "bank_accounts": 0}).sort("created_at", -1).to_list(500)
    stats = await asyncio.gather(*[resto_stats(r["id"]) for r in items])
    for r, st in zip(items, stats):
        r["stats"] = st
    return items


@api.post("/founder/restaurants")
async def founder_create(data: RestaurantIn, _=Depends(roles("founder"))):
    r = await create_restaurant_doc(data)
    r["stats"] = await resto_stats(r["id"])
    r.pop("bank_accounts", None)
    return r


@api.patch("/founder/restaurants/{rid}")
async def founder_update(rid: str, data: RestaurantPatch, _=Depends(roles("founder"))):
    upd = {k: v for k, v in data.model_dump().items() if v is not None and k != "admin_password"}
    if upd:
        await db.restaurants.update_one({"id": rid}, {"$set": upd})
    if data.admin_password:
        await db.users.update_one({"restaurant_id": rid, "role": "admin"}, {"$set": {"password_hash": hash_pw(data.admin_password)}})
    r = await db.restaurants.find_one({"id": rid}, {"_id": 0, "bank_accounts": 0})
    if not r:
        raise HTTPException(404, "Resto tidak ditemukan")
    r["stats"] = await resto_stats(rid)
    return r


# ---------------------------------------------------------------- Files / uploads
ALLOWED_IMG = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif"}
MAX_UPLOAD = 6 * 1024 * 1024


async def save_upload(file: UploadFile, rid: str, kind: str, public: bool) -> str:
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED_IMG:
        raise HTTPException(400, "Format gambar harus JPG/PNG/WEBP")
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Ukuran gambar maksimal 6MB")
    path = f"{storage.APP_NAME}/{rid}/{kind}/{uuid.uuid4()}.{ALLOWED_IMG[ctype]}"
    try:
        res = await run_in_threadpool(storage.put_object, path, data, ctype)
    except Exception as e:
        logger.error("upload failed: %s", e)
        raise HTTPException(502, "Gagal mengunggah gambar, coba lagi")
    await db.files.insert_one({"path": res["path"], "restaurant_id": rid, "content_type": ctype, "public": public,
                               "kind": kind, "created_at": now_iso()})
    return res["path"]


@api.post("/upload")
async def upload(kind: Literal["menu", "logo", "qris"] = Form(...), file: UploadFile = File(...),
                 user=Depends(roles("admin"))):
    path = await save_upload(file, user["restaurant_id"], kind, public=True)
    return {"path": path}


_file_cache: "OrderedDict[str, tuple[bytes, str]]" = OrderedDict()


@api.get("/files/{path:path}")
async def get_file(path: str, request: Request, token: Optional[str] = None):
    rec = await db.files.find_one({"path": path}, NO_ID)
    if not rec:
        raise HTTPException(404, "File tidak ditemukan")
    if not rec.get("public"):
        auth = request.headers.get("authorization", "")
        tok = token or (auth[7:] if auth.lower().startswith("bearer ") else None)
        user = await user_from_token(tok)
        if user.get("restaurant_id") != rec["restaurant_id"]:
            raise HTTPException(403, "Akses ditolak")
    if path in _file_cache:
        data, ctype = _file_cache[path]
        _file_cache.move_to_end(path)
    else:
        try:
            data, ctype = await run_in_threadpool(storage.get_object, path)
        except Exception:
            raise HTTPException(404, "File tidak tersedia")
        _file_cache[path] = (data, ctype)
        if len(_file_cache) > 200:
            _file_cache.popitem(last=False)
    cache = "public, max-age=86400" if rec.get("public") else "private, max-age=600"
    return Response(content=data, media_type=rec.get("content_type") or ctype, headers={"Cache-Control": cache})


# ---------------------------------------------------------------- Settings
class BankAccount(BaseModel):
    id: str = Field(default_factory=new_id)
    bank: str = Field(min_length=2, max_length=40)
    number: str = Field(min_length=3, max_length=40)
    holder: str = Field(min_length=2, max_length=80)
    enabled: bool = True


class SettingsIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    tagline: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=30)
    logo_path: Optional[str] = None
    qris_enabled: Optional[bool] = None
    qris_path: Optional[str] = None
    bank_accounts: Optional[List[BankAccount]] = None


@api.get("/settings")
async def get_settings(user=Depends(roles("admin", "kasir", "dapur"))):
    return await db.restaurants.find_one({"id": user["restaurant_id"]}, NO_ID)


@api.patch("/settings")
async def update_settings(data: SettingsIn, user=Depends(roles("admin"))):
    upd = data.model_dump(exclude_unset=True)
    if "bank_accounts" in upd:
        upd["bank_accounts"] = [b.model_dump() for b in data.bank_accounts]
    if upd:
        await db.restaurants.update_one({"id": user["restaurant_id"]}, {"$set": upd})
    return await db.restaurants.find_one({"id": user["restaurant_id"]}, NO_ID)


# ---------------------------------------------------------------- Outlets & Staff
class OutletIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    address: str = Field("", max_length=200)


@api.get("/outlets")
async def list_outlets(user=Depends(roles("admin", "kasir", "dapur"))):
    return await db.outlets.find({"restaurant_id": user["restaurant_id"]}, NO_ID).sort("created_at", 1).to_list(200)


@api.post("/outlets")
async def create_outlet(data: OutletIn, user=Depends(roles("admin"))):
    doc = {"id": new_id(), "restaurant_id": user["restaurant_id"], **data.model_dump(), "created_at": now_iso()}
    await db.outlets.insert_one(dict(doc))
    return doc


@api.patch("/outlets/{oid}")
async def update_outlet(oid: str, data: OutletIn, user=Depends(roles("admin"))):
    await db.outlets.update_one({"id": oid, "restaurant_id": user["restaurant_id"]}, {"$set": data.model_dump()})
    doc = await db.outlets.find_one({"id": oid, "restaurant_id": user["restaurant_id"]}, NO_ID)
    if not doc:
        raise HTTPException(404, "Data tidak ditemukan")
    return doc


@api.delete("/outlets/{oid}")
async def delete_outlet(oid: str, user=Depends(roles("admin"))):
    rid = user["restaurant_id"]
    if await db.outlets.count_documents({"restaurant_id": rid}) <= 1:
        raise HTTPException(400, "Minimal harus ada 1 outlet")
    if await db.users.count_documents({"outlet_id": oid}) or await db.tables.count_documents({"outlet_id": oid}):
        raise HTTPException(400, "Pindahkan staf & meja dari outlet ini terlebih dahulu")
    await db.outlets.delete_one({"id": oid, "restaurant_id": rid})
    return {"ok": True}


class StaffIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    role: Literal["kasir", "dapur"]
    outlet_id: str


class StaffPatch(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    outlet_id: Optional[str] = None
    active: Optional[bool] = None


@api.get("/staff")
async def list_staff(user=Depends(roles("admin"))):
    return await db.users.find({"restaurant_id": user["restaurant_id"], "role": {"$in": ["kasir", "dapur"]}},
                               {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)


@api.post("/staff")
async def create_staff(data: StaffIn, user=Depends(roles("admin"))):
    rid = user["restaurant_id"]
    if not await db.outlets.find_one({"id": data.outlet_id, "restaurant_id": rid}):
        raise HTTPException(400, "Outlet tidak valid")
    if await db.users.find_one({"email": data.email.lower()}):
        raise HTTPException(409, "Email sudah terdaftar")
    doc = {"id": new_id(), "email": data.email.lower(), "password_hash": hash_pw(data.password), "name": data.name,
           "role": data.role, "restaurant_id": rid, "outlet_id": data.outlet_id, "active": True, "created_at": now_iso()}
    await db.users.insert_one(dict(doc))
    doc.pop("password_hash")
    return doc


@api.patch("/staff/{uid}")
async def update_staff(uid: str, data: StaffPatch, user=Depends(roles("admin"))):
    q = {"id": uid, "restaurant_id": user["restaurant_id"], "role": {"$in": ["kasir", "dapur"]}}
    await check_outlet(user["restaurant_id"], data.outlet_id)
    upd = {k: v for k, v in data.model_dump().items() if v is not None and k != "password"}
    if data.password:
        upd["password_hash"] = hash_pw(data.password)
    if upd:
        await db.users.update_one(q, {"$set": upd})
    doc = await db.users.find_one(q, {"_id": 0, "password_hash": 0})
    if not doc:
        raise HTTPException(404, "Staf tidak ditemukan")
    return doc


@api.delete("/staff/{uid}")
async def delete_staff(uid: str, user=Depends(roles("admin"))):
    await db.users.delete_one({"id": uid, "restaurant_id": user["restaurant_id"], "role": {"$in": ["kasir", "dapur"]}})
    return {"ok": True}


# ---------------------------------------------------------------- Categories & Menu
class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    icon: str = Field("restaurant", max_length=40)
    sort: int = 0


@api.get("/categories")
async def list_categories(user=Depends(roles("admin", "kasir", "dapur"))):
    return await db.categories.find({"restaurant_id": user["restaurant_id"]}, NO_ID).sort("sort", 1).to_list(200)


@api.post("/categories")
async def create_category(data: CategoryIn, user=Depends(roles("admin"))):
    doc = {"id": new_id(), "restaurant_id": user["restaurant_id"], **data.model_dump()}
    await db.categories.insert_one(dict(doc))
    return doc


@api.patch("/categories/{cid}")
async def update_category(cid: str, data: CategoryIn, user=Depends(roles("admin"))):
    await db.categories.update_one({"id": cid, "restaurant_id": user["restaurant_id"]}, {"$set": data.model_dump()})
    doc = await db.categories.find_one({"id": cid, "restaurant_id": user["restaurant_id"]}, NO_ID)
    if not doc:
        raise HTTPException(404, "Data tidak ditemukan")
    return doc


@api.delete("/categories/{cid}")
async def delete_category(cid: str, user=Depends(roles("admin"))):
    rid = user["restaurant_id"]
    if await db.menu_items.count_documents({"restaurant_id": rid, "category_id": cid}):
        raise HTTPException(400, "Kategori masih memiliki menu")
    await db.categories.delete_one({"id": cid, "restaurant_id": rid})
    return {"ok": True}


class MenuIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field("", max_length=300)
    price: int = Field(ge=0, le=100_000_000)
    category_id: str
    image_path: Optional[str] = None
    image_url: Optional[str] = None
    available: bool = True
    badge: str = Field("", max_length=20)


@api.get("/menu")
async def list_menu(user=Depends(roles("admin", "kasir", "dapur"))):
    return await db.menu_items.find({"restaurant_id": user["restaurant_id"]}, NO_ID).sort("name", 1).to_list(1000)


@api.post("/menu")
async def create_menu(data: MenuIn, user=Depends(roles("admin"))):
    rid = user["restaurant_id"]
    if not await db.categories.find_one({"id": data.category_id, "restaurant_id": rid}):
        raise HTTPException(400, "Kategori tidak valid")
    doc = {"id": new_id(), "restaurant_id": rid, **data.model_dump(), "created_at": now_iso()}
    await db.menu_items.insert_one(dict(doc))
    return doc


@api.patch("/menu/{mid}")
async def update_menu(mid: str, data: MenuIn, user=Depends(roles("admin"))):
    await db.menu_items.update_one({"id": mid, "restaurant_id": user["restaurant_id"]}, {"$set": data.model_dump()})
    doc = await db.menu_items.find_one({"id": mid, "restaurant_id": user["restaurant_id"]}, NO_ID)
    if not doc:
        raise HTTPException(404, "Data tidak ditemukan")
    return doc


@api.patch("/menu/{mid}/availability")
async def toggle_menu(mid: str, available: bool = Query(...), user=Depends(roles("admin", "kasir"))):
    await db.menu_items.update_one({"id": mid, "restaurant_id": user["restaurant_id"]}, {"$set": {"available": available}})
    return {"ok": True}


@api.delete("/menu/{mid}")
async def delete_menu(mid: str, user=Depends(roles("admin"))):
    await db.menu_items.delete_one({"id": mid, "restaurant_id": user["restaurant_id"]})
    return {"ok": True}


# ---------------------------------------------------------------- Tables + QR
async def check_outlet(rid: str, oid: Optional[str]):
    if oid and not await db.outlets.find_one({"id": oid, "restaurant_id": rid}, {"_id": 1}):
        raise HTTPException(400, "Outlet tidak valid")


class TableIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    outlet_id: str


def public_base(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"


def table_link(request: Request, code: str) -> str:
    return f"{public_base(request)}/api/m/{code}"


@api.get("/tables")
async def list_tables(request: Request, user=Depends(roles("admin", "kasir"))):
    q = {"restaurant_id": user["restaurant_id"]}
    if user["role"] == "kasir":
        q["outlet_id"] = user["outlet_id"]
    items = await db.tables.find(q, NO_ID).sort("created_at", 1).to_list(500)
    for t in items:
        t["link"] = table_link(request, t["code"])
    return items


@api.post("/tables")
async def create_table(data: TableIn, request: Request, user=Depends(roles("admin"))):
    rid = user["restaurant_id"]
    if not await db.outlets.find_one({"id": data.outlet_id, "restaurant_id": rid}):
        raise HTTPException(400, "Outlet tidak valid")
    doc = {"id": new_id(), "restaurant_id": rid, "name": data.name, "outlet_id": data.outlet_id,
           "code": secrets.token_urlsafe(9), "active": True, "created_at": now_iso()}
    await db.tables.insert_one(dict(doc))
    doc["link"] = table_link(request, doc["code"])
    return doc


@api.patch("/tables/{tid}")
async def update_table(tid: str, data: TableIn, user=Depends(roles("admin"))):
    await check_outlet(user["restaurant_id"], data.outlet_id)
    await db.tables.update_one({"id": tid, "restaurant_id": user["restaurant_id"]}, {"$set": data.model_dump()})
    doc = await db.tables.find_one({"id": tid, "restaurant_id": user["restaurant_id"]}, NO_ID)
    if not doc:
        raise HTTPException(404, "Data tidak ditemukan")
    return doc


@api.post("/tables/{tid}/regenerate")
async def regen_table(tid: str, request: Request, user=Depends(roles("admin"))):
    code = secrets.token_urlsafe(9)
    await db.tables.update_one({"id": tid, "restaurant_id": user["restaurant_id"]}, {"$set": {"code": code}})
    t = await db.tables.find_one({"id": tid, "restaurant_id": user["restaurant_id"]}, NO_ID)
    if not t:
        raise HTTPException(404, "Meja tidak ditemukan")
    t["link"] = table_link(request, code)
    return t


@api.delete("/tables/{tid}")
async def delete_table(tid: str, user=Depends(roles("admin"))):
    await db.tables.delete_one({"id": tid, "restaurant_id": user["restaurant_id"]})
    return {"ok": True}


@api.get("/qr/{code}.png")
async def qr_png(code: str, request: Request):
    if not await db.tables.find_one({"code": code}, {"_id": 1}):
        raise HTTPException(404, "Meja tidak ditemukan")
    img = qrcode.make(table_link(request, code), box_size=12, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


# ---------------------------------------------------------------- Orders
KITCHEN_FLOW = ["baru", "dimasak", "siap", "disajikan"]
ALL_STATUS = ["pending"] + KITCHEN_FLOW + ["batal"]


class OrderItemIn(BaseModel):
    menu_id: str
    qty: int = Field(ge=1, le=99)
    note: str = Field("", max_length=120)


async def build_items(rid: str, items: List[OrderItemIn]):
    if not items:
        raise HTTPException(400, "Pesanan kosong")
    ids = list({i.menu_id for i in items})
    menu = {m["id"]: m for m in await db.menu_items.find({"restaurant_id": rid, "id": {"$in": ids}}, NO_ID).to_list(500)}
    out, total = [], 0
    for i in items:
        m = menu.get(i.menu_id)
        if not m or not m.get("available", True):
            raise HTTPException(400, f"Menu tidak tersedia: {m['name'] if m else i.menu_id}")
        line = m["price"] * i.qty
        total += line
        out.append({"menu_id": m["id"], "name": m["name"], "price": m["price"], "qty": i.qty, "note": i.note, "subtotal": line})
    return out, total


async def next_number(rid: str) -> str:
    day = datetime.now(timezone(timedelta(hours=7))).strftime("%y%m%d")
    c = await db.counters.find_one_and_update({"key": f"{rid}:{day}"}, {"$inc": {"seq": 1}}, upsert=True,
                                              return_document=ReturnDocument.AFTER)
    return f"#{day[-4:]}-{c['seq']:03d}"


def public_order(o: dict) -> dict:
    return {k: o.get(k) for k in ("id", "number", "table_name", "customer_name", "items", "total", "status", "payment_status",
                                  "payment_method", "bank", "created_at", "note")}


class PublicOrderIn(BaseModel):
    code: str
    customer_name: str = Field("", max_length=60)
    note: str = Field("", max_length=200)
    items: List[OrderItemIn] = Field(min_length=1, max_length=50)
    payment_method: Literal["kasir", "qris", "bank"] = "kasir"
    bank_id: Optional[str] = None


# simple per-IP throttle for public order endpoint (protects server from spam)
_rate: dict[str, list[float]] = defaultdict(list)


def throttle(key: str, limit: int, window: int):
    t = time.time()
    hits = [h for h in _rate[key] if t - h < window]
    if len(hits) >= limit:
        raise HTTPException(429, "Terlalu banyak permintaan, coba sebentar lagi")
    hits.append(t)
    _rate[key] = hits
    if len(_rate) > 5000:
        _rate.clear()


@api.get("/public/menu/{code}")
async def public_menu(code: str):
    table = await db.tables.find_one({"code": code, "active": True}, NO_ID)
    if not table:
        raise HTTPException(404, "Meja tidak ditemukan")
    resto = await db.restaurants.find_one({"id": table["restaurant_id"]}, NO_ID)
    if not resto or not resto.get("active", True):
        raise HTTPException(404, "Resto sedang tutup")
    rid = resto["id"]
    cats, menu, outlet = await asyncio.gather(
        db.categories.find({"restaurant_id": rid}, NO_ID).sort("sort", 1).to_list(200),
        db.menu_items.find({"restaurant_id": rid, "available": True}, NO_ID).sort("name", 1).to_list(1000),
        db.outlets.find_one({"id": table["outlet_id"]}, NO_ID))
    return {
        "restaurant": {"name": resto["name"], "tagline": resto.get("tagline", ""), "logo_path": resto.get("logo_path"),
                       "address": resto.get("address", "")},
        "table": {"name": table["name"], "outlet": outlet["name"] if outlet else ""},
        "categories": [{"id": c["id"], "name": c["name"], "icon": c.get("icon")} for c in cats],
        "menu": [{k: m.get(k) for k in ("id", "name", "description", "price", "category_id", "image_path", "image_url", "badge")}
                 for m in menu],
        "payment": {"qris_enabled": bool(resto.get("qris_enabled") and resto.get("qris_path")),
                    "qris_path": resto.get("qris_path") if resto.get("qris_enabled") else None,
                    "banks": [b for b in resto.get("bank_accounts", []) if b.get("enabled")]},
    }


@api.post("/public/orders")
async def public_create_order(data: PublicOrderIn, request: Request):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]
    throttle(f"order:{ip}", 10, 60)
    table = await db.tables.find_one({"code": data.code, "active": True}, NO_ID)
    if not table:
        raise HTTPException(404, "Meja tidak ditemukan")
    resto = await db.restaurants.find_one({"id": table["restaurant_id"]}, NO_ID)
    if not resto or not resto.get("active", True):
        raise HTTPException(404, "Resto sedang tutup")
    items, total = await build_items(resto["id"], data.items)
    bank = None
    if data.payment_method == "bank":
        bank = next((b for b in resto.get("bank_accounts", []) if b["id"] == data.bank_id and b.get("enabled")), None)
        if not bank:
            raise HTTPException(400, "Rekening tidak valid")
    if data.payment_method == "qris" and not (resto.get("qris_enabled") and resto.get("qris_path")):
        raise HTTPException(400, "QRIS tidak tersedia")
    order = {"id": new_id(), "number": await next_number(resto["id"]), "restaurant_id": resto["id"],
             "outlet_id": table["outlet_id"], "table_id": table["id"], "table_name": table["name"], "source": "meja",
             "customer_name": data.customer_name.strip() or "Tamu", "note": data.note, "items": items, "total": total,
             "status": "pending", "payment_status": "unpaid", "payment_method": data.payment_method, "bank": bank,
             "proof_path": None, "public_token": secrets.token_urlsafe(16), "created_at": now_iso(),
             "history": [{"status": "pending", "at": now_iso()}]}
    await db.orders.insert_one(dict(order))
    await hub.emit(resto["id"], table["outlet_id"], {"type": "order_new", "order": strip_order(order)})
    res = public_order(order)
    res["token"] = order["public_token"]
    return res


@api.get("/public/orders/{oid}")
async def public_get_order(oid: str, t: str):
    o = await db.orders.find_one({"id": oid, "public_token": t}, NO_ID)
    if not o:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    return public_order(o)


@api.post("/public/orders/{oid}/proof")
async def public_upload_proof(oid: str, request: Request, t: str = Form(...), file: UploadFile = File(...)):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]
    throttle(f"proof:{ip}", 6, 60)
    o = await db.orders.find_one({"id": oid, "public_token": t}, NO_ID)
    if not o:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    if o["payment_status"] == "paid":
        raise HTTPException(400, "Pesanan sudah lunas")
    path = await save_upload(file, o["restaurant_id"], "proof", public=False)
    await db.orders.update_one({"id": oid}, {"$set": {"proof_path": path, "payment_status": "verifying"}})
    o = await db.orders.find_one({"id": oid}, NO_ID)
    await hub.emit(o["restaurant_id"], o["outlet_id"], {"type": "order_update", "order": strip_order(o)})
    return public_order(o)


def strip_order(o: dict) -> dict:
    o = dict(o)
    o.pop("public_token", None)
    o.pop("_id", None)
    return o


def scope_query(user: dict, outlet_id: Optional[str] = None) -> dict:
    q = {"restaurant_id": user["restaurant_id"]}
    if user["role"] in ("kasir", "dapur"):
        q["outlet_id"] = user["outlet_id"]
    elif outlet_id:
        q["outlet_id"] = outlet_id
    return q


class PosOrderIn(BaseModel):
    items: List[OrderItemIn] = Field(min_length=1, max_length=80)
    table_name: str = Field("Take Away", max_length=40)
    customer_name: str = Field("", max_length=60)
    note: str = Field("", max_length=200)
    payment_method: Literal["cash", "qris", "bank", "kasir"] = "cash"
    paid: bool = True
    outlet_id: Optional[str] = None


@api.post("/orders")
async def pos_create_order(data: PosOrderIn, user=Depends(roles("admin", "kasir"))):
    rid = user["restaurant_id"]
    outlet_id = user.get("outlet_id") or data.outlet_id
    await check_outlet(rid, outlet_id)
    if not outlet_id:
        first = await db.outlets.find_one({"restaurant_id": rid}, NO_ID, sort=[("created_at", 1)])
        outlet_id = first["id"]
    items, total = await build_items(rid, data.items)
    order = {"id": new_id(), "number": await next_number(rid), "restaurant_id": rid, "outlet_id": outlet_id,
             "table_id": None, "table_name": data.table_name or "Take Away", "source": "kasir",
             "customer_name": data.customer_name.strip() or "Tamu", "note": data.note, "items": items, "total": total,
             "status": "baru", "payment_status": "paid" if data.paid else "unpaid", "payment_method": data.payment_method,
             "bank": None, "proof_path": None, "public_token": secrets.token_urlsafe(16), "created_by": user["name"],
             "paid_at": now_iso() if data.paid else None, "created_at": now_iso(),
             "history": [{"status": "baru", "at": now_iso()}]}
    await db.orders.insert_one(dict(order))
    o = strip_order(order)
    await hub.emit(rid, outlet_id, {"type": "order_new", "order": o})
    return o


@api.get("/orders")
async def list_orders(scope: Literal["active", "kitchen", "today", "all"] = "active", outlet_id: Optional[str] = None,
                      limit: int = Query(100, ge=1, le=500), user=Depends(roles("admin", "kasir", "dapur"))):
    q = scope_query(user, outlet_id)
    if scope == "active":
        q["$or"] = [{"status": {"$in": ["pending", "baru", "dimasak", "siap"]}},
                    {"status": "disajikan", "payment_status": {"$ne": "paid"}}]
    elif scope == "kitchen":
        since = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
        q["status"] = {"$in": KITCHEN_FLOW}
        q["created_at"] = {"$gte": since}
    elif scope == "today":
        q["created_at"] = {"$gte": (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()}
    return await db.orders.find(q, {"_id": 0, "public_token": 0}).sort("created_at", -1).to_list(limit)


class StatusIn(BaseModel):
    status: Literal["pending", "baru", "dimasak", "siap", "disajikan", "batal"]


@api.patch("/orders/{oid}/status")
async def update_status(oid: str, data: StatusIn, user=Depends(roles("admin", "kasir", "dapur"))):
    q = {**scope_query(user), "id": oid}
    o = await db.orders.find_one(q, NO_ID)
    if not o:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    if user["role"] == "dapur" and (data.status not in KITCHEN_FLOW or o["status"] not in KITCHEN_FLOW):
        raise HTTPException(403, "Dapur hanya dapat mengubah status masak")
    if user["role"] == "dapur" and abs(KITCHEN_FLOW.index(data.status) - KITCHEN_FLOW.index(o["status"])) > 1:
        raise HTTPException(400, "Status harus berpindah satu tahap")
    await db.orders.update_one({"id": oid}, {"$set": {"status": data.status, "updated_at": now_iso()},
                                             "$push": {"history": {"status": data.status, "at": now_iso(), "by": user["name"]}}})
    o = await db.orders.find_one({"id": oid}, {"_id": 0, "public_token": 0})
    await hub.emit(o["restaurant_id"], o["outlet_id"], {"type": "order_update", "order": o})
    return o


class PayIn(BaseModel):
    method: Literal["cash", "qris", "bank", "kasir"]
    paid: bool = True


@api.patch("/orders/{oid}/payment")
async def update_payment(oid: str, data: PayIn, user=Depends(roles("admin", "kasir"))):
    q = {**scope_query(user), "id": oid}
    upd = {"payment_status": "paid" if data.paid else "unpaid", "payment_method": data.method,
           "paid_at": now_iso() if data.paid else None}
    r = await db.orders.update_one(q, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    o = await db.orders.find_one({"id": oid}, {"_id": 0, "public_token": 0})
    await hub.emit(o["restaurant_id"], o["outlet_id"], {"type": "order_update", "order": o})
    return o


# ---------------------------------------------------------------- Expenses & Reports
class ExpenseIn(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    amount: int = Field(gt=0, le=1_000_000_000)
    category: str = Field("Operasional", max_length=40)
    date: Optional[str] = None
    outlet_id: Optional[str] = None


@api.get("/expenses")
async def list_expenses(days: int = Query(30, ge=1, le=366), user=Depends(roles("admin"))):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return await db.expenses.find({"restaurant_id": user["restaurant_id"], "date": {"$gte": since}}, NO_ID) \
        .sort("date", -1).to_list(1000)


@api.post("/expenses")
async def create_expense(data: ExpenseIn, user=Depends(roles("admin"))):
    await check_outlet(user["restaurant_id"], data.outlet_id)
    doc = {"id": new_id(), "restaurant_id": user["restaurant_id"], **data.model_dump()}
    doc["date"] = data.date or now_iso()
    await db.expenses.insert_one(dict(doc))
    return doc


@api.delete("/expenses/{eid}")
async def delete_expense(eid: str, user=Depends(roles("admin"))):
    await db.expenses.delete_one({"id": eid, "restaurant_id": user["restaurant_id"]})
    return {"ok": True}


WIB = timezone(timedelta(hours=7))


@api.get("/reports/summary")
async def report_summary(days: int = Query(7, ge=1, le=366), outlet_id: Optional[str] = None, user=Depends(roles("admin"))):
    rid = user["restaurant_id"]
    start_local = (datetime.now(WIB) - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    since = start_local.astimezone(timezone.utc).isoformat()
    oq = {"restaurant_id": rid, "created_at": {"$gte": since}}
    eq = {"restaurant_id": rid, "date": {"$gte": since}}
    if outlet_id:
        oq["outlet_id"] = outlet_id
        eq["outlet_id"] = outlet_id
    orders = await db.orders.find(oq, {"_id": 0, "items": 1, "total": 1, "payment_status": 1, "payment_method": 1,
                                       "status": 1, "created_at": 1, "outlet_id": 1, "source": 1}).to_list(20000)
    expenses = await db.expenses.find(eq, NO_ID).to_list(5000)
    paid = [o for o in orders if o["payment_status"] == "paid" and o["status"] != "batal"]
    revenue = sum(o["total"] for o in paid)
    exp_total = sum(e["amount"] for e in expenses)
    series = OrderedDict()
    for i in range(days):
        d = (start_local + timedelta(days=i)).strftime("%Y-%m-%d")
        series[d] = {"date": d, "revenue": 0, "expense": 0, "orders": 0}

    def local_day(iso):
        return datetime.fromisoformat(iso).astimezone(WIB).strftime("%Y-%m-%d")
    for o in paid:
        d = local_day(o["created_at"])
        if d in series:
            series[d]["revenue"] += o["total"]
            series[d]["orders"] += 1
    for e in expenses:
        d = local_day(e["date"])
        if d in series:
            series[d]["expense"] += e["amount"]
    top: dict[str, dict] = {}
    for o in paid:
        for it in o["items"]:
            t = top.setdefault(it["name"], {"name": it["name"], "qty": 0, "revenue": 0})
            t["qty"] += it["qty"]
            t["revenue"] += it["subtotal"]
    methods: dict[str, int] = defaultdict(int)
    for o in paid:
        methods[o["payment_method"]] += o["total"]
    exp_cat: dict[str, int] = defaultdict(int)
    for e in expenses:
        exp_cat[e.get("category") or "Lainnya"] += e["amount"]
    return {
        "revenue": revenue, "expense": exp_total, "profit": revenue - exp_total, "orders": len(paid),
        "all_orders": len(orders), "unpaid": sum(o["total"] for o in orders if o["payment_status"] != "paid" and o["status"] != "batal"),
        "avg_ticket": int(revenue / len(paid)) if paid else 0,
        "from_table": sum(1 for o in orders if o.get("source") == "meja"),
        "series": list(series.values()),
        "top_items": sorted(top.values(), key=lambda x: -x["qty"])[:8],
        "methods": [{"method": k, "amount": v} for k, v in methods.items()],
        "expense_categories": [{"category": k, "amount": v} for k, v in exp_cat.items()],
    }


# ---------------------------------------------------------------- Customer web page (NFC / QR target)
CUSTOMER_HTML = (ROOT_DIR / "customer_page.html").read_text(encoding="utf-8")


@api.get("/m/{code}", response_class=HTMLResponse)
async def customer_page(code: str):
    safe = "".join(ch for ch in code if ch.isalnum() or ch in "-_")
    return HTMLResponse(CUSTOMER_HTML.replace("__TABLE_CODE__", safe), headers={"Cache-Control": "no-cache"})


# ---------------------------------------------------------------- Web App (static Expo web export)
WEB_DIR = (ROOT_DIR / "web_dist").resolve()


@api.get("/app", include_in_schema=False)
@api.get("/app/{path:path}", include_in_schema=False)
async def web_app(path: str = ""):
    if not (WEB_DIR / "index.html").exists():
        raise HTTPException(404, "Web app belum di-build")
    target = (WEB_DIR / path).resolve()
    if path and target.is_file() and str(target).startswith(str(WEB_DIR)):
        cache = "public, max-age=31536000, immutable" if "/_expo/" in f"/{path}" or path.startswith("assets/") else "no-cache"
        return FileResponse(target, headers={"Cache-Control": cache})
    return FileResponse(WEB_DIR / "index.html", headers={"Cache-Control": "no-cache"})


BACKUP_DIR = (ROOT_DIR.parent / "backup_out").resolve()


@api.get("/download/{name}", include_in_schema=False)
async def download_backup(name: str):
    f = (BACKUP_DIR / name).resolve()
    if not name.endswith(".zip") or not f.is_file() or f.parent != BACKUP_DIR:
        raise HTTPException(404, "Tidak ditemukan")
    return FileResponse(f, media_type="application/zip", filename="project-backup.zip")


app.include_router(api)

app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(CORSMiddleware, allow_credentials=False, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["X-Frame-Options"] = "SAMEORIGIN"
    return resp


# ---------------------------------------------------------------- Seed
DEMO_IMG = {
    "burger": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=70",
    "chicken": "https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?w=600&q=70",
    "pizza": "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=70",
    "fries": "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&q=70",
    "nasgor": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&q=70",
    "kopi": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=70",
    "latte": "https://images.unsplash.com/photo-1561882468-9110e03e0f78?w=600&q=70",
    "tea": "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=70",
}


async def seed():
    fe, fp = os.environ["FOUNDER_EMAIL"].lower(), os.environ["FOUNDER_PASSWORD"]
    if not await db.users.find_one({"email": fe}):
        await db.users.insert_one({"id": new_id(), "email": fe, "password_hash": hash_pw(fp), "name": "Founder",
                                   "role": "founder", "restaurant_id": None, "outlet_id": None, "active": True,
                                   "created_at": now_iso()})
    if os.environ.get("SEED_DEMO") != "true" or await db.users.find_one({"email": "admin@kopisenja.id"}):
        return
    r = await create_restaurant_doc(RestaurantIn(name="Kopi Senja", owner_name="Budi", phone="081234567890",
                                                 address="Jl. Senja No. 7", city="Jakarta",
                                                 admin_email="admin@kopisenja.id", admin_password="Admin123!",
                                                 admin_name="Admin Senja"))
    rid = r["id"]
    await db.restaurants.update_one({"id": rid}, {"$set": {"tagline": "Good Food, Good Mood!", "bank_accounts": [
        {"id": new_id(), "bank": "BCA", "number": "1234567890", "holder": "Kopi Senja", "enabled": True},
        {"id": new_id(), "bank": "Mandiri", "number": "9876543210", "holder": "Kopi Senja", "enabled": True}]}})
    outlet = await db.outlets.find_one({"restaurant_id": rid}, NO_ID)
    for email, role, name in [("kasir@kopisenja.id", "kasir", "Kasir Sari"), ("dapur@kopisenja.id", "dapur", "Chef Andi")]:
        await db.users.insert_one({"id": new_id(), "email": email, "password_hash": hash_pw("Staff123!"), "name": name,
                                   "role": role, "restaurant_id": rid, "outlet_id": outlet["id"], "active": True,
                                   "created_at": now_iso()})
    cats = {}
    for i, (n, ic) in enumerate([("Burger", "fast-food"), ("Makanan", "restaurant"), ("Snack", "pizza"), ("Minuman", "cafe")]):
        cats[n] = new_id()
        await db.categories.insert_one({"id": cats[n], "restaurant_id": rid, "name": n, "icon": ic, "sort": i})
    menu = [("Cheese Burger", "Burger", 45000, "burger", "Daging sapi juicy, keju leleh & saus spesial", "Best"),
            ("Spicy Chicken Burger", "Burger", 49000, "chicken", "Ayam crispy pedas, selada segar & tomat", "Spicy"),
            ("Nasi Goreng Senja", "Makanan", 38000, "nasgor", "Nasi goreng kampung dengan telur & kerupuk", ""),
            ("Pizza Margherita", "Makanan", 65000, "pizza", "Saus tomat, mozzarella & basil segar", "New"),
            ("French Fries", "Snack", 25000, "fries", "Kentang goreng renyah dengan saus", ""),
            ("Kopi Susu Senja", "Minuman", 22000, "kopi", "Espresso, susu segar & gula aren", "Best"),
            ("Caffe Latte", "Minuman", 28000, "latte", "Latte lembut dengan latte art", ""),
            ("Iced Lemon Tea", "Minuman", 18000, "tea", "Teh segar dengan perasan lemon", "")]
    for name, cat, price, img, desc, badge in menu:
        await db.menu_items.insert_one({"id": new_id(), "restaurant_id": rid, "category_id": cats[cat], "name": name,
                                        "description": desc, "price": price, "image_path": None, "image_url": DEMO_IMG[img],
                                        "available": True, "badge": badge, "created_at": now_iso()})
    for i in range(1, 5):
        await db.tables.insert_one({"id": new_id(), "restaurant_id": rid, "name": f"Meja {i}", "outlet_id": outlet["id"],
                                    "code": f"demo-meja-{i}", "active": True, "created_at": now_iso()})
    logger.info("Demo data seeded")


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    try:
        await seed()
    except Exception as e:
        logger.error("seed failed: %s", e)
    try:
        await run_in_threadpool(storage.init_storage)
    except Exception as e:
        logger.error("storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
