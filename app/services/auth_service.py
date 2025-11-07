from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os
from fastapi import HTTPException, status

# Настройки
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 часа

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class AuthService:
    def __init__(self):
        self.users_db = {}  # Временное хранилище
    
    def verify_password(self, plain_password, hashed_password):
        return pwd_context.verify(plain_password, hashed_password)
    
    def get_password_hash(self, password):
        return pwd_context.hash(password)
    
    def create_access_token(self, data: dict, expires_delta: timedelta = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=15)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    
    def authenticate_user(self, email: str, password: str):
        user = self.users_db.get(email)
        if not user:
            return False
        if not self.verify_password(password, user["hashed_password"]):
            return False
        return user
    
    def register_user(self, email: str, password: str, full_name: str = None):
        if email in self.users_db:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        hashed_password = self.get_password_hash(password)
        user_data = {
            "email": email,
            "hashed_password": hashed_password,
            "full_name": full_name,
            "is_active": True,
            "created_at": datetime.utcnow()
        }
        self.users_db[email] = user_data
        return user_data

auth_service = AuthService()