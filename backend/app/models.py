"""
Modelos Pydantic para validação de dados
"""
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import date, time, datetime
from enum import Enum
import re

# ============================================
# ENUMS
# ============================================
class UserRole(str, Enum):
    ADM = "ADM"
    FUNCIONARIO = "FUNCIONARIO"

class AppointmentType(str, Enum):
    CONSULTA = "CONSULTA"
    EXAME = "EXAME"

class AppointmentStatus(str, Enum):
    CONFIRMADO = "CONFIRMADO"
    PENDENTE = "PENDENTE"
    CANCELADO = "CANCELADO"
    CONCLUIDO = "CONCLUIDO"

class NotificationType(str, Enum):
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"

# ============================================
# USER MODELS
# ============================================
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=3)
    birth_date: str  # formato dd/mm/aaaa
    specialty: Optional[str] = None
    role: UserRole = UserRole.FUNCIONARIO
    
    @validator('full_name')
    def validate_name(cls, v):
        """Valida que o nome não contém números"""
        if re.search(r'\d', v):
            raise ValueError('Nome não pode conter números')
        return v.strip()
    
    @validator('birth_date')
    def validate_birth_date(cls, v):
        """Valida formato dd/mm/aaaa"""
        try:
            day, month, year = v.split('/')
            date(int(year), int(month), int(day))
            return v
        except:
            raise ValueError('Data deve estar no formato dd/mm/aaaa')

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    birth_date: Optional[str] = None
    specialty: Optional[str] = None
    role: Optional[UserRole] = None

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    birth_date: str
    specialty: Optional[str]
    role: UserRole
    created_at: datetime

# ============================================
# APPOINTMENT MODELS
# ============================================
class AppointmentCreate(BaseModel):
    doctor_id: str
    patient_name: str = Field(..., min_length=3)
    patient_phone: str = Field(..., min_length=10)
    patient_email: Optional[EmailStr] = None
    appointment_type: AppointmentType
    appointment_date: str  # formato dd/mm/aaaa
    appointment_time: str  # formato HH:MM
    duration_minutes: int = Field(default=30, ge=15, le=240)
    status: AppointmentStatus = AppointmentStatus.PENDENTE
    notes: Optional[str] = None
    
    @validator('patient_name')
    def validate_patient_name(cls, v):
        """Valida que o nome não contém números"""
        if re.search(r'\d', v):
            raise ValueError('Nome do paciente não pode conter números')
        return v.strip()
    
    @validator('appointment_date')
    def validate_appointment_date(cls, v):
        """Valida formato dd/mm/aaaa"""
        try:
            day, month, year = v.split('/')
            date(int(year), int(month), int(day))
            return v
        except:
            raise ValueError('Data deve estar no formato dd/mm/aaaa')
    
    @validator('appointment_time')
    def validate_appointment_time(cls, v):
        """Valida formato HH:MM"""
        try:
            hour, minute = v.split(':')
            time(int(hour), int(minute))
            return v
        except:
            raise ValueError('Hora deve estar no formato HH:MM')

class AppointmentUpdate(BaseModel):
    patient_name: Optional[str] = None
    patient_phone: Optional[str] = None
    patient_email: Optional[EmailStr] = None
    appointment_type: Optional[AppointmentType] = None
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[AppointmentStatus] = None
    notes: Optional[str] = None

class AppointmentResponse(BaseModel):
    id: str
    doctor_id: str
    patient_name: str
    patient_phone: str
    patient_email: Optional[str]
    appointment_type: AppointmentType
    appointment_date: str
    appointment_time: str
    duration_minutes: int
    status: AppointmentStatus
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]

# ============================================
# FILTER MODELS
# ============================================
class AppointmentFilters(BaseModel):
    patient_name: Optional[str] = None
    specialty: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    status: Optional[AppointmentStatus] = None
    appointment_type: Optional[AppointmentType] = None

# ============================================
# REPORT MODELS
# ============================================
class ReportRequest(BaseModel):
    date_from: str
    date_to: str
    doctor_id: Optional[str] = None
    appointment_type: Optional[AppointmentType] = None
    export_format: Optional[str] = "json"  # json, excel, pdf, csv

class DashboardStats(BaseModel):
    total_appointments: int
    appointments_by_status: dict
    appointments_by_type: dict
    upcoming_appointments: int
    today_appointments: int

# ============================================
# NOTIFICATION MODELS
# ============================================
class NotificationCreate(BaseModel):
    appointment_id: str
    notification_type: NotificationType
    recipient: str

class NotificationResponse(BaseModel):
    id: str
    appointment_id: str
    notification_type: NotificationType
    recipient: str
    status: str
    sent_at: datetime
    error_message: Optional[str]

# ============================================
# AUTH MODELS
# ============================================
class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class PasswordReset(BaseModel):
    email: EmailStr

class PasswordUpdate(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)
