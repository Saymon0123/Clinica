"""
Rotas de autenticação
"""
from fastapi import APIRouter, HTTPException, status, Depends
from app.models import UserRegister, UserLogin, Token, PasswordReset, PasswordUpdate, UserResponse
from app.database import supabase
from app.auth import create_access_token, parse_date_br, format_date_br
from datetime import timedelta
from app.config import settings

router = APIRouter()

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister):
    """Registra novo usuário"""
    try:
        # Criar usuário no Supabase Auth
        auth_response = supabase.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password,
            "options": {
                "email_redirect_to": None,
                "data": {
                    "full_name": user_data.full_name,
                }
            }
        })
        
        if not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Erro ao criar usuário"
            )
        
        user_id = auth_response.user.id
        
        # Converter data para formato ISO
        birth_date = parse_date_br(user_data.birth_date)
        
        # Criar perfil no banco
        profile_data = {
            "id": user_id,
            "email": user_data.email,
            "full_name": user_data.full_name,
            "birth_date": birth_date,
            "specialty": user_data.specialty,
            "role": user_data.role.value
        }
        
        profile_result = supabase.table("profiles").insert(profile_data).execute()
        
        if not profile_result.data:
            # Rollback: deletar usuário do auth
            supabase.auth.admin.delete_user(user_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Erro ao criar perfil"
            )
        
        # Criar token
        access_token = create_access_token(
            data={"sub": user_id},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        profile = profile_result.data[0]
        profile["birth_date"] = format_date_br(profile["birth_date"])
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": profile
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """Login de usuário"""
    try:
        # Autenticar com Supabase
        auth_response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais inválidas"
            )
        
        user_id = auth_response.user.id
        
        # Buscar perfil
        profile_result = supabase.table("profiles").select("*").eq("id", user_id).execute()
        
        if not profile_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Perfil não encontrado"
            )
        
        # Criar token
        access_token = create_access_token(
            data={"sub": user_id},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        profile = profile_result.data[0]
        profile["birth_date"] = format_date_br(profile["birth_date"])
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": profile
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas"
        )

@router.post("/password-reset")
async def request_password_reset(data: PasswordReset):
    """Solicita reset de senha"""
    try:
        supabase.auth.reset_password_email(data.email)
        return {"message": "E-mail de recuperação enviado"}
    except Exception as e:
        # Não revelar se o e-mail existe ou não (segurança)
        return {"message": "Se o e-mail existir, você receberá instruções"}

@router.post("/logout")
async def logout():
    """Logout (cliente deve deletar o token)"""
    return {"message": "Logout realizado com sucesso"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Obtém dados do usuário autenticado"""
    current_user["birth_date"] = format_date_br(current_user["birth_date"])
    return current_user

# Import necessário
from app.auth import get_current_user
