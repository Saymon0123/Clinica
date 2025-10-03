# 🚀 Como Iniciar o Sistema de Agendamento Médico

## ⚠️ IMPORTANTE - Leia Primeiro!

Este sistema precisa de configuração do **Supabase** antes de funcionar. Siga os passos abaixo.

## 📝 Passo 1: Configurar Supabase

### 1.1 Criar Projeto no Supabase
1. Acesse [supabase.com](https://supabase.com)
2. Crie uma conta gratuita
3. Clique em "New Project"
4. Preencha:
   - **Name**: medical-scheduling (ou nome de sua preferência)
   - **Database Password**: crie uma senha forte
   - **Region**: escolha o mais próximo de você
5. Aguarde a criação (2-3 minutos)

### 1.2 Executar Script SQL
1. No dashboard do Supabase, vá em **SQL Editor** (menu lateral esquerdo)
2. Clique em "New Query"
3. Abra o arquivo `/workspace/database/schema.sql` deste projeto
4. Copie **TODO** o conteúdo
5. Cole no SQL Editor do Supabase
6. Clique em **Run** (botão verde no canto inferior direito)
7. Aguarde a mensagem de sucesso ✓

### 1.3 Obter Credenciais
1. No Supabase, vá em **Settings** → **API**
2. Copie as seguintes informações:

   - **Project URL**: `https://xxxxxxxxxxxxx.supabase.co`
   - **anon/public key**: Token longo começando com `eyJ...`
   - **service_role key**: Outro token (⚠️ SECRETO!)

## 📦 Passo 2: Configurar Backend

### 2.1 Criar arquivo .env
```bash
cd /workspace/backend
cp .env.example .env
nano .env  # ou use seu editor preferido
```

### 2.2 Preencher variáveis
Cole no arquivo `.env`:

```env
# Supabase - cole suas credenciais aqui
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-service-role-key-aqui

# JWT - gere uma chave secreta
SECRET_KEY=cole-uma-chave-aleatoria-de-32-caracteres-aqui
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# SendGrid (opcional - deixe vazio por enquanto)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# Twilio (opcional - deixe vazio por enquanto)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# App
APP_NAME=Medical Scheduling System
```

**Para gerar SECRET_KEY:**
```bash
# Linux/Mac
openssl rand -hex 32

# Ou use qualquer sequência aleatória de 32+ caracteres
```

Salve o arquivo (Ctrl+O, Enter, Ctrl+X no nano)

## 🎨 Passo 3: Configurar Frontend

### 3.1 Criar arquivo .env.local
```bash
cd /workspace/frontend
cp .env.example .env.local
nano .env.local
```

### 3.2 Preencher variáveis
Cole no arquivo `.env.local`:

```env
# Supabase - use a ANON KEY, não a service role!
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-public-key-aqui

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000
```

⚠️ **ATENÇÃO**: Use a **anon/public key** aqui, NÃO a service_role!

Salve o arquivo

## ▶️ Passo 4: Iniciar Aplicação

### 4.1 Backend (Terminal 1)
```bash
cd /workspace/backend
export PATH="$HOME/.local/bin:$PATH"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Aguarde até ver:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```

### 4.2 Frontend (Terminal 2 - novo terminal)
```bash
cd /workspace/frontend
npm run dev
```

Aguarde até ver:
```
✓ Ready in 2s
○ Local:        http://localhost:3000
```

## 🎉 Passo 5: Usar o Sistema

### 5.1 Acessar
Abra seu navegador em: **http://localhost:3000**

### 5.2 Criar primeiro usuário ADM
1. Clique em "Criar conta"
2. Preencha:
   - **Nome**: Seu Nome
   - **Email**: admin@clinica.com
   - **Data de Nascimento**: 01/01/1990 (formato dd/mm/aaaa)
   - **Especialidade**: Administrador
   - **Função**: **Administrador** ← IMPORTANTE!
   - **Senha**: admin123 (ou outra de sua preferência)
3. Clique em "Criar Conta"

### 5.3 Fazer Login
1. Use o e-mail e senha que você acabou de criar
2. Você será redirecionado para o dashboard

### 5.4 Explorar
✅ **Dashboard**: Visão geral dos agendamentos
✅ **Agendamentos**: Criar, editar, visualizar
✅ **Usuários** (ADM): Gerenciar funcionários
✅ **Relatórios**: Gerar e exportar dados
✅ **Tema**: Botão no canto superior direito alterna claro/escuro

## 🔍 Verificar se está Funcionando

### Backend
```bash
curl http://localhost:8000/health
# Deve retornar: {"status":"healthy"}

# Ver documentação da API
# Abra: http://localhost:8000/docs
```

### Frontend
- Abra: http://localhost:3000
- Deve carregar a página de login

## 🐛 Solução de Problemas

### Backend não inicia
```bash
# Verificar se instalou dependências
cd /workspace/backend
pip install --user fastapi uvicorn[standard] python-dotenv pydantic pydantic-settings supabase python-jose[cryptography] passlib[bcrypt] python-multipart sendgrid twilio openpyxl reportlab

# Verificar arquivo .env existe e está preenchido
cat .env
```

### Frontend não inicia
```bash
# Reinstalar dependências
cd /workspace/frontend
rm -rf node_modules .next
npm install
npm run dev
```

### Erro de conexão com Supabase
- ✅ Verifique se executou o script SQL
- ✅ Verifique se as credenciais estão corretas
- ✅ Verifique se copiou a URL completa (com https://)
- ✅ No frontend, use ANON KEY, não service_role!

### Erro "CORS"
- Verifique se `ALLOWED_ORIGINS` no backend inclui `http://localhost:3000`

### Erro ao criar usuário
- Verifique se o script SQL foi executado corretamente no Supabase
- Verifique logs do backend no terminal

## 📚 Próximos Passos

### Opcional - Configurar Notificações

#### SendGrid (E-mail)
1. Crie conta em [sendgrid.com](https://sendgrid.com)
2. Crie API Key em Settings → API Keys
3. Verifique seu domínio de envio
4. Adicione as credenciais no `.env` do backend:
```env
SENDGRID_API_KEY=SG.xxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@seudominio.com
```
5. Reinicie o backend

#### Twilio (WhatsApp)
1. Crie conta em [twilio.com](https://twilio.com)
2. Configure WhatsApp Business API
3. Obtenha credenciais em Console
4. Adicione no `.env` do backend:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```
5. Reinicie o backend

## 📖 Documentação Adicional

- `README.md` - Visão geral do projeto
- `SETUP.md` - Guia de instalação completo
- `DEPLOY.md` - Como fazer deploy em VPS

## 🆘 Precisa de Ajuda?

1. Verifique os logs nos terminais
2. Verifique se todas as dependências foram instaladas
3. Verifique se Supabase está configurado corretamente
4. Veja a documentação da API: http://localhost:8000/docs

## ✅ Checklist Rápido

Antes de reportar problemas, verifique:

- [ ] Projeto criado no Supabase
- [ ] Script SQL executado com sucesso
- [ ] Arquivo `.env` criado no backend com credenciais corretas
- [ ] Arquivo `.env.local` criado no frontend com credenciais corretas
- [ ] Dependências do backend instaladas
- [ ] Dependências do frontend instaladas (npm install)
- [ ] Backend rodando em http://localhost:8000
- [ ] Frontend rodando em http://localhost:3000
- [ ] Primeiro usuário ADM criado

Tudo pronto! 🎉
