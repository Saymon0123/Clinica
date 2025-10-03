"""
Rotas de notificações
"""
from fastapi import APIRouter, HTTPException, status, Depends
from app.models import NotificationCreate, NotificationResponse
from app.database import supabase
from app.auth import get_current_user
from app.config import settings
from typing import List

router = APIRouter()

@router.post("/send", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def send_notification(
    notification: NotificationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Envia notificação por e-mail ou WhatsApp"""
    try:
        # Buscar agendamento
        apt_result = supabase.table("appointments").select("*").eq("id", notification.appointment_id).execute()
        
        if not apt_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Agendamento não encontrado"
            )
        
        appointment = apt_result.data[0]
        
        # Verificar permissão
        if current_user["role"] != "ADM" and appointment["doctor_id"] != current_user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado"
            )
        
        # Enviar notificação
        notification_status = "PENDENTE"
        error_message = None
        
        try:
            if notification.notification_type.value == "EMAIL":
                await send_email_notification(appointment, notification.recipient)
                notification_status = "ENVIADO"
            elif notification.notification_type.value == "WHATSAPP":
                await send_whatsapp_notification(appointment, notification.recipient)
                notification_status = "ENVIADO"
        except Exception as e:
            notification_status = "FALHOU"
            error_message = str(e)
        
        # Registrar notificação
        notification_data = {
            "appointment_id": notification.appointment_id,
            "notification_type": notification.notification_type.value,
            "recipient": notification.recipient,
            "status": notification_status,
            "error_message": error_message
        }
        
        result = supabase.table("notifications").insert(notification_data).execute()
        
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/", response_model=List[NotificationResponse])
async def list_notifications(current_user: dict = Depends(get_current_user)):
    """Lista notificações (apenas ADM vê todas)"""
    try:
        if current_user["role"] == "ADM":
            result = supabase.table("notifications").select("*").order("sent_at", desc=True).execute()
        else:
            # Funcionário vê notificações de seus agendamentos
            result = supabase.table("notifications")\
                .select("*, appointment_id(doctor_id)")\
                .eq("appointment_id.doctor_id", current_user["id"])\
                .order("sent_at", desc=True)\
                .execute()
        
        return result.data
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

async def send_email_notification(appointment, recipient):
    """Envia notificação por e-mail usando SendGrid"""
    if not settings.SENDGRID_API_KEY:
        raise Exception("SendGrid não configurado")
    
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        
        message = Mail(
            from_email=settings.SENDGRID_FROM_EMAIL,
            to_emails=recipient,
            subject=f'Agendamento - {appointment["appointment_type"]}',
            html_content=f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0ea5e9;">Confirmação de Agendamento</h2>
                <p><strong>Paciente:</strong> {appointment["patient_name"]}</p>
                <p><strong>Tipo:</strong> {appointment["appointment_type"]}</p>
                <p><strong>Data:</strong> {appointment["appointment_date"]}</p>
                <p><strong>Horário:</strong> {appointment["appointment_time"]}</p>
                <p><strong>Status:</strong> {appointment["status"]}</p>
                {f'<p><strong>Observações:</strong> {appointment["notes"]}</p>' if appointment.get("notes") else ''}
                <hr>
                <p style="color: #666; font-size: 12px;">
                    Esta é uma mensagem automática. Por favor, não responda.
                </p>
            </div>
            """
        )
        
        sg = SendGridAPIClient(settings.SENDGRID_API_KEY)
        response = sg.send(message)
        
        if response.status_code not in [200, 201, 202]:
            raise Exception(f"Erro ao enviar e-mail: {response.status_code}")
            
    except Exception as e:
        raise Exception(f"Erro SendGrid: {str(e)}")

async def send_whatsapp_notification(appointment, recipient):
    """Envia notificação por WhatsApp usando Twilio"""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        raise Exception("Twilio não configurado")
    
    try:
        from twilio.rest import Client
        
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        
        message_body = f"""
🏥 *Confirmação de Agendamento*

👤 Paciente: {appointment["patient_name"]}
📋 Tipo: {appointment["appointment_type"]}
📅 Data: {appointment["appointment_date"]}
⏰ Horário: {appointment["appointment_time"]}
✅ Status: {appointment["status"]}

{f'📝 Observações: {appointment["notes"]}' if appointment.get("notes") else ''}

Esta é uma mensagem automática.
        """
        
        # Formatar número para WhatsApp
        whatsapp_to = f"whatsapp:{recipient}"
        
        message = client.messages.create(
            body=message_body,
            from_=settings.TWILIO_WHATSAPP_FROM,
            to=whatsapp_to
        )
        
        if message.error_code:
            raise Exception(f"Erro Twilio: {message.error_message}")
            
    except Exception as e:
        raise Exception(f"Erro WhatsApp: {str(e)}")

@router.post("/send-bulk")
async def send_bulk_notifications(
    appointment_ids: List[str],
    notification_type: str,
    current_user: dict = Depends(get_current_user)
):
    """Envia notificações em massa"""
    try:
        results = []
        
        for appointment_id in appointment_ids:
            apt_result = supabase.table("appointments").select("*").eq("id", appointment_id).execute()
            
            if not apt_result.data:
                continue
            
            appointment = apt_result.data[0]
            
            # Verificar permissão
            if current_user["role"] != "ADM" and appointment["doctor_id"] != current_user["id"]:
                continue
            
            # Determinar destinatário
            recipient = appointment.get("patient_email") if notification_type == "EMAIL" else appointment.get("patient_phone")
            
            if not recipient:
                continue
            
            # Enviar notificação
            try:
                notification = NotificationCreate(
                    appointment_id=appointment_id,
                    notification_type=notification_type,
                    recipient=recipient
                )
                result = await send_notification(notification, current_user)
                results.append({"appointment_id": appointment_id, "status": "success"})
            except:
                results.append({"appointment_id": appointment_id, "status": "failed"})
        
        return {
            "total": len(appointment_ids),
            "sent": len([r for r in results if r["status"] == "success"]),
            "failed": len([r for r in results if r["status"] == "failed"]),
            "results": results
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
