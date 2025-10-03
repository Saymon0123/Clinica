"""
Rotas de gerenciamento de agendamentos
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List, Optional
from app.models import (
    AppointmentCreate, AppointmentUpdate, AppointmentResponse,
    AppointmentFilters, AppointmentStatus, DashboardStats
)
from app.database import supabase
from app.auth import get_current_user, get_current_admin, parse_date_br, format_date_br, parse_time
from datetime import datetime, date

router = APIRouter()

@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    appointment: AppointmentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Cria novo agendamento"""
    try:
        # Verificar permissões
        if current_user["role"] != "ADM" and appointment.doctor_id != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você só pode criar agendamentos para si mesmo"
            )
        
        # Converter datas
        appointment_date = parse_date_br(appointment.appointment_date)
        appointment_time = parse_time(appointment.appointment_time)
        
        # Verificar conflitos de horário
        conflict_check = supabase.rpc(
            'check_appointment_conflict',
            {
                'p_doctor_id': appointment.doctor_id,
                'p_date': appointment_date,
                'p_time': appointment_time,
                'p_duration': appointment.duration_minutes
            }
        ).execute()
        
        if conflict_check.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um agendamento neste horário"
            )
        
        # Criar agendamento
        appointment_data = {
            "doctor_id": appointment.doctor_id,
            "patient_name": appointment.patient_name,
            "patient_phone": appointment.patient_phone,
            "patient_email": appointment.patient_email,
            "appointment_type": appointment.appointment_type.value,
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "duration_minutes": appointment.duration_minutes,
            "status": appointment.status.value,
            "notes": appointment.notes,
            "created_by": current_user["id"]
        }
        
        result = supabase.table("appointments").insert(appointment_data).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Erro ao criar agendamento"
            )
        
        appointment_created = result.data[0]
        appointment_created["appointment_date"] = format_date_br(appointment_created["appointment_date"])
        
        return appointment_created
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/", response_model=List[AppointmentResponse])
async def list_appointments(
    current_user: dict = Depends(get_current_user),
    patient_name: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    appointment_type: Optional[str] = Query(None)
):
    """Lista agendamentos com filtros"""
    try:
        # Construir query
        query = supabase.table("appointments").select("*")
        
        # Funcionário só vê seus agendamentos
        if current_user["role"] != "ADM":
            query = query.eq("doctor_id", current_user["id"])
        
        # Aplicar filtros
        if patient_name:
            query = query.ilike("patient_name", f"%{patient_name}%")
        
        if date_from:
            date_from_iso = parse_date_br(date_from)
            query = query.gte("appointment_date", date_from_iso)
        
        if date_to:
            date_to_iso = parse_date_br(date_to)
            query = query.lte("appointment_date", date_to_iso)
        
        if status_filter:
            query = query.eq("status", status_filter)
        
        if appointment_type:
            query = query.eq("appointment_type", appointment_type)
        
        # Ordenar por data
        query = query.order("appointment_date", desc=False).order("appointment_time", desc=False)
        
        result = query.execute()
        
        appointments = result.data
        for apt in appointments:
            apt["appointment_date"] = format_date_br(apt["appointment_date"])
        
        return appointments
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    """Obtém estatísticas do dashboard"""
    try:
        # Construir query base
        query = supabase.table("appointments").select("*")
        
        # Funcionário só vê seus dados
        if current_user["role"] != "ADM":
            query = query.eq("doctor_id", current_user["id"])
        
        result = query.execute()
        appointments = result.data
        
        # Calcular estatísticas
        total = len(appointments)
        
        by_status = {}
        by_type = {}
        today = date.today().isoformat()
        today_count = 0
        upcoming_count = 0
        
        for apt in appointments:
            # Status
            status = apt["status"]
            by_status[status] = by_status.get(status, 0) + 1
            
            # Tipo
            apt_type = apt["appointment_type"]
            by_type[apt_type] = by_type.get(apt_type, 0) + 1
            
            # Hoje
            if apt["appointment_date"] == today:
                today_count += 1
            
            # Próximos (não cancelados/concluídos)
            if apt["appointment_date"] >= today and apt["status"] in ["PENDENTE", "CONFIRMADO"]:
                upcoming_count += 1
        
        return {
            "total_appointments": total,
            "appointments_by_status": by_status,
            "appointments_by_type": by_type,
            "upcoming_appointments": upcoming_count,
            "today_appointments": today_count
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(
    appointment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtém detalhes de um agendamento"""
    try:
        result = supabase.table("appointments").select("*").eq("id", appointment_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agendamento não encontrado"
            )
        
        appointment = result.data[0]
        
        # Verificar permissão
        if current_user["role"] != "ADM" and appointment["doctor_id"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado"
            )
        
        appointment["appointment_date"] = format_date_br(appointment["appointment_date"])
        
        return appointment
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.put("/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(
    appointment_id: str,
    appointment_data: AppointmentUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Atualiza um agendamento"""
    try:
        # Buscar agendamento
        check = supabase.table("appointments").select("*").eq("id", appointment_id).execute()
        
        if not check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agendamento não encontrado"
            )
        
        existing = check.data[0]
        
        # Verificar permissão
        if current_user["role"] != "ADM" and existing["doctor_id"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado"
            )
        
        # Preparar dados para atualização
        update_data = {}
        
        if appointment_data.patient_name:
            update_data["patient_name"] = appointment_data.patient_name
        
        if appointment_data.patient_phone:
            update_data["patient_phone"] = appointment_data.patient_phone
        
        if appointment_data.patient_email is not None:
            update_data["patient_email"] = appointment_data.patient_email
        
        if appointment_data.appointment_type:
            update_data["appointment_type"] = appointment_data.appointment_type.value
        
        if appointment_data.status:
            update_data["status"] = appointment_data.status.value
        
        if appointment_data.notes is not None:
            update_data["notes"] = appointment_data.notes
        
        if appointment_data.duration_minutes:
            update_data["duration_minutes"] = appointment_data.duration_minutes
        
        # Se mudou data ou hora, verificar conflitos
        if appointment_data.appointment_date or appointment_data.appointment_time:
            new_date = parse_date_br(appointment_data.appointment_date) if appointment_data.appointment_date else existing["appointment_date"]
            new_time = parse_time(appointment_data.appointment_time) if appointment_data.appointment_time else existing["appointment_time"]
            new_duration = appointment_data.duration_minutes if appointment_data.duration_minutes else existing["duration_minutes"]
            
            conflict_check = supabase.rpc(
                'check_appointment_conflict',
                {
                    'p_doctor_id': existing["doctor_id"],
                    'p_date': new_date,
                    'p_time': new_time,
                    'p_duration': new_duration,
                    'p_appointment_id': appointment_id
                }
            ).execute()
            
            if conflict_check.data:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Já existe um agendamento neste horário"
                )
            
            if appointment_data.appointment_date:
                update_data["appointment_date"] = new_date
            if appointment_data.appointment_time:
                update_data["appointment_time"] = new_time
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nenhum dado para atualizar"
            )
        
        # Atualizar
        result = supabase.table("appointments").update(update_data).eq("id", appointment_id).execute()
        
        updated = result.data[0]
        updated["appointment_date"] = format_date_br(updated["appointment_date"])
        
        return updated
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/{appointment_id}")
async def delete_appointment(
    appointment_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Deleta um agendamento (apenas ADM)"""
    try:
        # Verificar se existe
        check = supabase.table("appointments").select("id").eq("id", appointment_id).execute()
        
        if not check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agendamento não encontrado"
            )
        
        # Deletar
        supabase.table("appointments").delete().eq("id", appointment_id).execute()
        
        return {"message": "Agendamento deletado com sucesso"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/history/{appointment_id}")
async def get_appointment_history(
    appointment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Obtém histórico de alterações de um agendamento"""
    try:
        # Verificar se agendamento existe e se usuário tem permissão
        apt_check = supabase.table("appointments").select("doctor_id").eq("id", appointment_id).execute()
        
        if not apt_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agendamento não encontrado"
            )
        
        if current_user["role"] != "ADM" and apt_check.data[0]["doctor_id"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado"
            )
        
        # Buscar histórico
        result = supabase.table("appointment_history")\
            .select("*, changed_by(full_name)")\
            .eq("appointment_id", appointment_id)\
            .order("changed_at", desc=True)\
            .execute()
        
        return result.data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
