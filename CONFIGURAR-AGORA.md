# 🚀 Configure em 5 Minutos!

## ⚠️ ANTES DE INICIAR A APLICAÇÃO

A aplicação precisa de configuração do **Supabase**. Siga os passos abaixo:

---

## 📝 Passo 1: Criar Projeto no Supabase (2 minutos)

### 1.1 Acesse o Supabase
```
🌐 Abra em seu navegador: https://supabase.com
```

### 1.2 Crie uma conta gratuita
- Clique em **"Start your project"**
- Faça login com GitHub ou e-mail

### 1.3 Crie um novo projeto
1. Clique em **"New Project"**
2. Preencha:
   - **Name**: `medical-scheduling` (ou qualquer nome)
   - **Database Password**: Crie uma senha forte (anote!)
   - **Region**: Escolha o mais próximo de você
3. Clique em **"Create new project"**
4. ⏱️ Aguarde 2-3 minutos enquanto o projeto é criado

---

## 🗄️ Passo 2: Executar Script SQL (1 minuto)

### 2.1 Abra o SQL Editor
1. No painel esquerdo do Supabase, clique em **"SQL Editor"** (ícone 📝)
2. Clique em **"New Query"**

### 2.2 Copie o Schema
1. Abra o arquivo: `database/schema.sql` (está neste projeto)
2. Copie **TODO** o conteúdo (Ctrl+A, Ctrl+C)

### 2.3 Execute no Supabase
1. Cole no SQL Editor do Supabase (Ctrl+V)
2. Clique no botão **"Run"** (canto inferior direito)
3. ✅ Aguarde a mensagem de sucesso

---

## 🔑 Passo 3: Copiar Credenciais (1 minuto)

### 3.1 Obtenha as Credenciais
1. No Supabase, vá em **"Settings"** (engrenagem no menu esquerdo)
2. Clique em **"API"**
3. Você verá duas seções importantes:

#### Project URL
```
https://xxxxxxxxxxxxx.supabase.co
```
📋 **Copie este URL completo**

#### API Keys
Você verá duas keys:

**anon / public** (use no FRONTEND)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZi...
```
📋 **Copie esta key**

**service_role** (use no BACKEND) ⚠️ **SECRETA!**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZi...
```
📋 **Copie esta key também**

---

## ⚙️ Passo 4: Configurar Variáveis (1 minuto)

### 4.1 Backend (.env)

Abra o arquivo: `backend/.env`

**Substitua estas linhas:**
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-service-role-key-aqui
```

**Por suas credenciais:**
```env
SUPABASE_URL=https://xxxxx.supabase.co    ← Cole seu Project URL
SUPABASE_KEY=eyJhbGciOiJ...               ← Cole sua service_role key
```

**Para SECRET_KEY**, substitua por uma chave aleatória:
```env
SECRET_KEY=qualquer-texto-aleatorio-de-32-caracteres-ou-mais-aqui
```

💡 **Dica**: Pode ser qualquer texto longo e aleatório, exemplo:
```
SECRET_KEY=minha-super-senha-secreta-2024-medical-scheduling-app
```

**Salve o arquivo!** (Ctrl+S)

### 4.2 Frontend (.env.local)

Abra o arquivo: `frontend/.env.local`

**Substitua estas linhas:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-public-key-aqui
```

**Por suas credenciais:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co    ← Cole seu Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJ...          ← Cole sua anon/public key
```

⚠️ **ATENÇÃO**: No frontend use a **anon/public key**, NÃO a service_role!

**Salve o arquivo!** (Ctrl+S)

---

## ✅ Passo 5: Verificar Configuração

Confira se está tudo certo:

```bash
# Backend
cat backend/.env | grep SUPABASE_URL
cat backend/.env | grep SUPABASE_KEY
cat backend/.env | grep SECRET_KEY

# Frontend
cat frontend/.env.local | grep NEXT_PUBLIC_SUPABASE_URL
cat frontend/.env.local | grep NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Você deve ver seus valores (não os exemplos).

---

## 🚀 Pronto! Agora Inicie a Aplicação

### Opção 1: Automático (Recomendado)
```bash
./start.sh
```

### Opção 2: Manual

**Terminal 1 - Backend:**
```bash
cd backend
export PATH="$HOME/.local/bin:$PATH"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

---

## 🌐 Acesse o Sistema

Abra seu navegador em:

```
http://localhost:3000
```

### Primeiro Acesso

1. Clique em **"Criar conta"**
2. Preencha todos os campos:
   - **Nome**: Seu nome completo
   - **E-mail**: seu@email.com
   - **Data de Nascimento**: 01/01/1990 (formato dd/mm/aaaa)
   - **Especialidade**: Administrador (ou sua especialidade)
   - **Função**: Selecione **"Administrador"** ⚠️
   - **Senha**: Crie uma senha (mínimo 6 caracteres)
3. Clique em **"Criar Conta"**
4. Faça login com as credenciais
5. Explore o dashboard! 🎉

---

## 📊 Endpoints Importantes

Após iniciar, você pode acessar:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Documentação da API**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

---

## 🐛 Problemas?

### Backend não inicia?
```bash
# Verificar se .env existe e está preenchido
cat backend/.env

# Reinstalar dependências
cd backend
pip install --user fastapi uvicorn[standard] python-dotenv pydantic supabase
```

### Frontend não carrega?
```bash
# Verificar se .env.local existe
cat frontend/.env.local

# Reinstalar
cd frontend
rm -rf node_modules .next
npm install
```

### Erro de conexão Supabase?
- ✅ Verificar se executou o schema.sql
- ✅ Verificar se as URLs/keys estão corretas (sem espaços extras)
- ✅ No frontend, usar **anon key**, não service_role
- ✅ Verificar se o projeto Supabase está ativo

---

## ✅ Checklist Final

Antes de iniciar, confirme:

- [ ] ✅ Criei projeto no Supabase
- [ ] ✅ Executei `database/schema.sql` no SQL Editor
- [ ] ✅ Copiei Project URL
- [ ] ✅ Copiei service_role key (backend)
- [ ] ✅ Copiei anon/public key (frontend)
- [ ] ✅ Editei `backend/.env` com as credenciais
- [ ] ✅ Editei `frontend/.env.local` com as credenciais
- [ ] ✅ Gerei uma SECRET_KEY aleatória

---

## 🎉 Tudo Pronto!

Agora execute:

```bash
./start.sh
```

E abra: http://localhost:3000

**Boa sorte com seu sistema de agendamento médico!** 🏥

---

Para mais detalhes, consulte: `START.md`
