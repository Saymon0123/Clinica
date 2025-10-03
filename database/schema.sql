-- ============================================
-- SCHEMA DO BANCO DE DADOS - SISTEMA DE AGENDAMENTO MÉDICO
-- ============================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TABELA: profiles
-- Estende os dados do auth.users do Supabase
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  birth_date DATE NOT NULL,
  specialty TEXT,
  role TEXT NOT NULL CHECK (role IN ('ADM', 'FUNCIONARIO')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABELA: appointments
-- Armazena consultas e exames
-- ============================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  doctor_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  patient_email TEXT,
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('CONSULTA', 'EXAME')),
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL CHECK (status IN ('CONFIRMADO', 'PENDENTE', 'CANCELADO', 'CONCLUIDO')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  -- Índices compostos para melhor performance
  UNIQUE(doctor_id, appointment_date, appointment_time)
);

-- ============================================
-- TABELA: appointment_history
-- Histórico de alterações nos agendamentos
-- ============================================
CREATE TABLE IF NOT EXISTS appointment_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('CRIADO', 'EDITADO', 'CANCELADO', 'EXCLUIDO')),
  changed_by UUID REFERENCES profiles(id) NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  old_data JSONB,
  new_data JSONB
);

-- ============================================
-- TABELA: notifications
-- Registra notificações enviadas
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('EMAIL', 'WHATSAPP')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ENVIADO', 'FALHOU', 'PENDENTE')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  error_message TEXT
);

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointment_history_appointment_id ON appointment_history(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_appointment_id ON notifications(appointment_id);

-- ============================================
-- TRIGGERS PARA UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TRIGGER PARA HISTÓRICO DE ALTERAÇÕES
-- ============================================
CREATE OR REPLACE FUNCTION log_appointment_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO appointment_history (appointment_id, action, changed_by, new_data)
    VALUES (NEW.id, 'CRIADO', NEW.created_by, row_to_json(NEW)::jsonb);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO appointment_history (appointment_id, action, changed_by, old_data, new_data)
    VALUES (NEW.id, 'EDITADO', auth.uid(), row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO appointment_history (appointment_id, action, changed_by, old_data)
    VALUES (OLD.id, 'EXCLUIDO', auth.uid(), row_to_json(OLD)::jsonb);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER appointments_history_trigger
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION log_appointment_changes();

-- ============================================
-- FUNÇÃO: Verificar conflitos de horário
-- ============================================
CREATE OR REPLACE FUNCTION check_appointment_conflict(
  p_doctor_id UUID,
  p_date DATE,
  p_time TIME,
  p_duration INTEGER,
  p_appointment_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_conflict_count INTEGER;
  v_end_time TIME;
BEGIN
  v_end_time := p_time + (p_duration || ' minutes')::INTERVAL;
  
  SELECT COUNT(*) INTO v_conflict_count
  FROM appointments
  WHERE doctor_id = p_doctor_id
    AND appointment_date = p_date
    AND status NOT IN ('CANCELADO', 'CONCLUIDO')
    AND (p_appointment_id IS NULL OR id != p_appointment_id)
    AND (
      (appointment_time >= p_time AND appointment_time < v_end_time)
      OR (appointment_time + (duration_minutes || ' minutes')::INTERVAL > p_time 
          AND appointment_time < p_time)
    );
  
  RETURN v_conflict_count > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNÇÃO: Limpeza automática de dados antigos (> 1 mês)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Deletar agendamentos com mais de 1 mês
  DELETE FROM appointments
  WHERE appointment_date < NOW() - INTERVAL '1 month'
    AND status IN ('CANCELADO', 'CONCLUIDO');
  
  -- Deletar notificações antigas
  DELETE FROM notifications
  WHERE sent_at < NOW() - INTERVAL '1 month';
  
  -- Deletar histórico antigo
  DELETE FROM appointment_history
  WHERE changed_at < NOW() - INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Habilitar RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies para profiles
CREATE POLICY "Usuários podem ver seu próprio perfil"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "ADM pode ver todos os perfis"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

CREATE POLICY "ADM pode criar perfis"
  ON profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

CREATE POLICY "ADM pode atualizar perfis"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

CREATE POLICY "ADM pode deletar perfis"
  ON profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

-- Policies para appointments
CREATE POLICY "Funcionários podem ver seus próprios agendamentos"
  ON appointments FOR SELECT
  USING (doctor_id = auth.uid());

CREATE POLICY "ADM pode ver todos os agendamentos"
  ON appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

CREATE POLICY "Funcionários podem criar seus próprios agendamentos"
  ON appointments FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "ADM pode criar qualquer agendamento"
  ON appointments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

CREATE POLICY "Funcionários podem atualizar seus próprios agendamentos"
  ON appointments FOR UPDATE
  USING (doctor_id = auth.uid());

CREATE POLICY "ADM pode atualizar qualquer agendamento"
  ON appointments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

CREATE POLICY "ADM pode deletar qualquer agendamento"
  ON appointments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

-- Policies para appointment_history
CREATE POLICY "Usuários podem ver histórico de seus agendamentos"
  ON appointment_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE id = appointment_history.appointment_id
        AND doctor_id = auth.uid()
    )
  );

CREATE POLICY "ADM pode ver todo o histórico"
  ON appointment_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

-- Policies para notifications
CREATE POLICY "ADM pode ver todas as notificações"
  ON notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'ADM'
    )
  );

-- ============================================
-- DADOS INICIAIS (SEED)
-- ============================================
-- Nota: Criar usuário ADM inicial manualmente após setup
-- através do Supabase Auth e depois inserir na tabela profiles
