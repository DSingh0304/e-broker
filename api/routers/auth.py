"""User auth: phone + salted-password login/registration backed by PostgreSQL."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.database import get_db
from api.core.passwords import hash_password, is_legacy_hash, verify_password
from api.db.models import User

router = APIRouter(prefix="/auth", tags=["auth"])

# Public self-registration is limited to marketplace roles. ADMIN accounts are
# created via seeding or by an existing admin — never by open signup.
SELF_REGISTER_ROLES = {"KABADIWALA", "VENDOR"}


class LoginRequest(BaseModel):
    phone: str
    password: str


class RegisterRequest(BaseModel):
    phone: str
    password: str = Field(min_length=4, max_length=128)
    full_name: str = Field(min_length=1, max_length=128)
    role: str = "KABADIWALA"


def _public_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "phone_number": user.phone_number,
        "full_name": user.full_name or "User",
        "role": user.role,
    }


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.phone_number == req.phone.strip())
    user = (await db.execute(stmt)).scalar_one_or_none()

    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid phone number or password")

    # Transparently upgrade legacy unsalted hashes on successful login.
    if is_legacy_hash(user.password_hash):
        user.password_hash = hash_password(req.password)
        await db.commit()

    return _public_user(user)


@router.post("/register", status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(status_code=422, detail="Phone number is required")
    role = req.role.upper()
    if role not in SELF_REGISTER_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Open registration is limited to Kabadiwala and Vendor accounts",
        )
    existing = (await db.execute(select(User).where(User.phone_number == phone))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Phone number already registered")

    user = User(
        phone_number=phone,
        full_name=req.full_name.strip(),
        role=role,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return _public_user(user)
