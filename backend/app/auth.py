import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import get_db

router = APIRouter(prefix="/login", tags=["login"])

PHOTON_URL = os.getenv("PHOTON_URL", "https://paintry-photon.onrender.com").rstrip("/")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "")
CODE_TTL = timedelta(minutes=5)
MAX_TRIES = 5


class StartBody(BaseModel):
    phone: str


class VerifyBody(BaseModel):
    phone: str
    code: str


def normalize(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        digits = "1" + digits
    if not 11 <= len(digits) <= 15:
        raise HTTPException(400, "Enter a valid phone number")
    return "+" + digits


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


@router.post("/start")
async def login_start(body: StartBody):
    phone = normalize(body.phone)
    code = f"{secrets.randbelow(1_000_000):06d}"
    db = get_db()
    await db.login_codes.replace_one(
        {"phone": phone},
        {
            "phone": phone,
            "code_hash": _hash(code),
            "tries": 0,
            "expires_at": datetime.now(timezone.utc) + CODE_TTL,
        },
        upsert=True,
    )
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{PHOTON_URL}/send",
                json={"to": phone, "text": f"Your pAIntry code is {code}. It expires in 5 minutes."},
                headers={"x-internal-secret": INTERNAL_SECRET},
            )
            r.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"Could not send code: {e}")
    return {"sent": True, "phone": phone}


@router.post("/verify")
async def login_verify(body: VerifyBody):
    phone = normalize(body.phone)
    db = get_db()
    rec = await db.login_codes.find_one({"phone": phone})
    if not rec:
        raise HTTPException(400, "No code requested")
    expires = rec["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc) or rec["tries"] >= MAX_TRIES:
        await db.login_codes.delete_one({"phone": phone})
        raise HTTPException(400, "Code expired, request a new one")
    if not secrets.compare_digest(rec["code_hash"], _hash(body.code.strip())):
        await db.login_codes.update_one({"phone": phone}, {"$inc": {"tries": 1}})
        raise HTTPException(401, "Wrong code")
    await db.login_codes.delete_one({"phone": phone})

    user = await db.users.find_one({"phone": phone})
    new_user = False
    if not user:
        res = await db.users.insert_one({"phone": phone, "name": "", "created_at": datetime.now(timezone.utc)})
        user = {"_id": res.inserted_id, "phone": phone, "name": ""}
        new_user = True
    return {"user_id": str(user["_id"]), "name": user.get("name", ""), "phone": phone, "new_user": new_user}


# ---------- Supabase login (email code or Google). Data stays in MongoDB. ----------
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


class SupabaseBody(BaseModel):
    access_token: str


@router.post("/supabase")
async def login_supabase(body: SupabaseBody):
    """Verify a Supabase session token, then find/create the matching Mongo user."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(500, "Supabase is not configured on the server")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(f"{SUPABASE_URL}/auth/v1/user",
                             headers={"apikey": SUPABASE_ANON_KEY,
                                      "Authorization": f"Bearer {body.access_token}"})
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired session")
    sb = r.json()
    sb_id, email = sb.get("id"), (sb.get("email") or "").lower()
    meta = sb.get("user_metadata") or {}
    name = meta.get("full_name") or meta.get("name") or ""

    db = get_db()
    user = await db.users.find_one({"supabase_id": sb_id})
    if not user and email:
        user = await db.users.find_one({"email": email})
        if user:
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"supabase_id": sb_id}})
    new_user = False
    if not user:
        doc = {"supabase_id": sb_id, "email": email, "name": name,
               "created_at": datetime.now(timezone.utc)}
        res = await db.users.insert_one(doc)
        user = doc | {"_id": res.inserted_id}
        new_user = True
    return {"user_id": str(user["_id"]), "name": user.get("name", ""), "email": email,
            "phone": user.get("phone"), "new_user": new_user}