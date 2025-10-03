"""
Conexão com Supabase
"""
from supabase import create_client, Client
from app.config import settings

def get_supabase() -> Client:
    """Retorna cliente Supabase"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

supabase: Client = get_supabase()
