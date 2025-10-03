"""
Autenticação e autorização
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
from app.config import settings
from app.database import supabase
from app.models import UserRole

security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Cria token JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    """Verifica token JWT"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido"
            )
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado"
        )

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Obtém usuário atual do token"""
    token = credentials.credentials
    user_id = verify_token(token)
    
    # Buscar usuário no banco
    result = supabase.table("profiles").select("*").eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado"
        )
    
    return result.data[0]

async def get_current_admin(current_user: dict = Depends(get_current_user)):
    """Verifica se usuário é ADM"""
    if current_user["role"] != UserRole.ADM.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Apenas administradores."
        )
    return current_user

def parse_date_br(date_str: str) -> str:
    """Converte data de dd/mm/aaaa para aaaa-mm-dd"""
    day, month, year = date_str.split('/')
    return f"{year}-{month.zfill(2)}-{day.zfill(2)}"

def format_date_br(date_str: str) -> str:
    """Converte data de aaaa-mm-dd para dd/mm/aaaa"""
    parts = date_str.split('T')[0].split('-')  # Remove hora se existir
    return f"{parts[2]}/{parts[1]}/{parts[0]}"

def parse_time(time_str: str) -> str:
    """Valida e formata hora HH:MM"""
    hour, minute = time_str.split(':')
    return f"{hour.zfill(2)}:{minute.zfill(2)}:00"
