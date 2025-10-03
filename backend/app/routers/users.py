"""
Rotas de gerenciamento de usuários
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List
from app.models import UserResponse, UserUpdate, UserRegister
from app.database import supabase
from app.auth import get_current_admin, get_current_user, parse_date_br, format_date_br

router = APIRouter()

@router.get("/", response_model=List[UserResponse])
async def list_users(current_user: dict = Depends(get_current_admin)):
    """Lista todos os usuários (apenas ADM)"""
    try:
        result = supabase.table("profiles").select("*").execute()
        
        users = result.data
        for user in users:
            user["birth_date"] = format_date_br(user["birth_date"])
        
        return users
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Obtém dados de um usuário específico"""
    # Funcionário só pode ver próprio perfil, ADM pode ver qualquer um
    if current_user["role"] != "ADM" and current_user["id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado"
        )
    
    try:
        result = supabase.table("profiles").select("*").eq("id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado"
            )
        
        user = result.data[0]
        user["birth_date"] = format_date_br(user["birth_date"])
        
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Atualiza dados de um usuário (apenas ADM)"""
    try:
        # Preparar dados para atualização
        update_data = {}
        
        if user_data.full_name:
            update_data["full_name"] = user_data.full_name
        
        if user_data.birth_date:
            update_data["birth_date"] = parse_date_br(user_data.birth_date)
        
        if user_data.specialty is not None:
            update_data["specialty"] = user_data.specialty
        
        if user_data.role:
            update_data["role"] = user_data.role.value
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nenhum dado para atualizar"
            )
        
        # Atualizar no banco
        result = supabase.table("profiles").update(update_data).eq("id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado"
            )
        
        user = result.data[0]
        user["birth_date"] = format_date_br(user["birth_date"])
        
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_admin)):
    """Deleta um usuário (apenas ADM)"""
    try:
        # Verificar se usuário existe
        check = supabase.table("profiles").select("id").eq("id", user_id).execute()
        
        if not check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado"
            )
        
        # Deletar perfil (cascade vai deletar agendamentos relacionados)
        supabase.table("profiles").delete().eq("id", user_id).execute()
        
        # Deletar do Auth
        try:
            supabase.auth.admin.delete_user(user_id)
        except:
            pass  # Continuar mesmo se falhar no auth
        
        return {"message": "Usuário deletado com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/doctors/list", response_model=List[UserResponse])
async def list_doctors(current_user: dict = Depends(get_current_user)):
    """Lista todos os médicos (funcionários e ADM)"""
    try:
        result = supabase.table("profiles").select("*").execute()
        
        doctors = result.data
        for doctor in doctors:
            doctor["birth_date"] = format_date_br(doctor["birth_date"])
        
        return doctors
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
