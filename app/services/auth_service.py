from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os
from fastapi import HTTPException, status

# Настройки
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 часа

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

class AuthService:
    def __init__(self):
        self.users_db = {}
        self.ACCESS_TOKEN_EXPIRE_MINUTES = ACCESS_TOKEN_EXPIRE_MINUTES
        
        # 👇 СПИСОК РАЗРЕШЕННЫХ EMAIL-АДРЕСОВ
        self.allowed_emails = [
            "stanislav.kankin@mail.ru",
            "dsoloviev@hr-link.ru",
            'vfadina@hr-link.ru',
            'dkirillovykh@hr-link.ru',
            'dlebedev@hr-link.ru'
        ]
        
        # Создаем администратора по умолчанию
        self.create_default_admin()
    
    def create_default_admin(self):
        """Создает администратора по умолчанию"""
        admin_email = "stanislav.kankin@mail.ru"  # ваш email как администратор
        if admin_email not in self.users_db:
            hashed_password = self.get_password_hash("admin123")  # временный пароль
            self.users_db[admin_email] = {
                "email": admin_email,
                "hashed_password": hashed_password,
                "full_name": "Администратор",
                "is_active": True,
                "is_admin": True,
                "created_at": datetime.utcnow()
            }
            print(f"✅ Создан администратор: {admin_email}")
    
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
        # 👇 ПРОВЕРКА: разрешен ли email для регистрации
        if email not in self.allowed_emails:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Регистрация не разрешена для этого email. Обратитесь к администратору."
            )
        
        if email in self.users_db:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email уже зарегистрирован"
            )
        
        hashed_password = self.get_password_hash(password)
        user_data = {
            "email": email,
            "hashed_password": hashed_password,
            "full_name": full_name,
            "is_active": True,
            "is_admin": False,
            "created_at": datetime.utcnow()
        }
        self.users_db[email] = user_data
        
        print(f"✅ Зарегистрирован новый пользователь: {email} - {full_name}")
        return user_data
    
    def add_allowed_email(self, email: str):
        """Добавить email в список разрешенных (для администрирования)"""
        if email not in self.allowed_emails:
            self.allowed_emails.append(email)
            print(f"✅ Добавлен разрешенный email: {email}")
    
    def remove_allowed_email(self, email: str):
        """Удалить email из списка разрешенных"""
        if email in self.allowed_emails:
            self.allowed_emails.remove(email)
            print(f"❌ Удален разрешенный email: {email}")
    
    def get_allowed_emails(self):
        """Получить список всех разрешенных email"""
        return self.allowed_emails

auth_service = AuthService()