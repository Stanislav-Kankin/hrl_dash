from pydantic import BaseModel
from typing import Optional

class UserRegister(BaseModel):
    email: str  # Заменили EmailStr на str
    password: str
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    email: str  # Заменили EmailStr на str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    email: str
    full_name: Optional[str]
    is_active: bool
    is_admin: bool = False