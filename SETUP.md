# Guia de Instalação Local - Sistema de Agendamento Médico

Este guia ajuda você a configurar o sistema localmente para desenvolvimento.

## 📋 Requisitos

- Node.js 18+ ([Download](https://nodejs.org))
- Python 3.11+ ([Download](https://python.org))
- Conta no Supabase ([Criar conta](https://supabase.com))
- Git ([Download](https://git-scm.com))

## 🗄️ 1. Configurar Supabase

### Criar Projeto
1. Acesse [supabase.com](https://supabase.com)
2. Clique em "New Project"
3. Preencha os dados e crie o projeto
4. Aguarde a criação (leva alguns minutos)

### Configurar Banco de Dados
1. No dashboard do Supabase, vá em **SQL Editor**
2. Abra o arquivo `/workspace/database/schema.sql` do projeto
3. Copie todo o conteúdo
4. Cole no SQL Editor do Supabase
5. Clique em **Run** para executar

### Obter Credenciais
1. Vá em **Settings** → **API**
2. Anote:
   - **Project URL**: `https://xxxxxxxxxxx.supabase.co`
   - **anon/public key**: Token público
   - **service_role key**: Token privado (NUNCA exponha no frontend!)

## 🔧 2. Configurar Backend (FastAPI)

### Navegar para o diretório
```bash
cd backend
```

### Criar ambiente virtual
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### Instalar dependências
```bash
pip install -r requirements.txt
```

### Configurar variáveis de ambiente
Copie o arquivo de exemplo:
```bash
cp .env.example .env
```

Edite o arquivo `.env` e preencha:
```env
# Supabase (cole suas credenciais aqui)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-service-role-key-aqui

# JWT (gere uma chave secreta)
SECRET_KEY=sua-chave-secreta-aqui-minimo-32-caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# SendGrid (opcional para testes)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# Twilio (opcional para testes)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# App
APP_NAME=Medical Scheduling System
```

**Dica**: Para gerar uma SECRET_KEY segura:
```bash
# Linux/Mac
openssl rand -hex 32

# Windows (PowerShell)
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

### Iniciar servidor
```bash
uvicorn main:app --reload
```

O backend estará rodando em: `http://localhost:8000`

Acesse a documentação da API: `http://localhost:8000/docs`

## 🎨 3. Configurar Frontend (Next.js)

### Abrir novo terminal e navegar
```bash
cd frontend
```

### Instalar dependências
```bash
npm install
```

### Configurar variáveis de ambiente
Copie o arquivo de exemplo:
```bash
cp .env.example .env.local
```

Edite o arquivo `.env.local`:
```env
# Supabase (use a anon/public key, NÃO a service role!)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Iniciar aplicação
```bash
npm run dev
```

O frontend estará rodando em: `http://localhost:3000`

## 🧪 4. Testar o Sistema

### Criar primeiro usuário ADM
1. Acesse `http://localhost:3000`
2. Clique em "Criar conta"
3. Preencha os dados:
   - Nome: Seu nome
   - Email: seu@email.com
   - Data de Nascimento: 01/01/1990
   - Especialidade: Administrador
   - Função: **Administrador**
   - Senha: senha123

### Fazer Login
1. Use as credenciais criadas
2. Você será redirecionado para o dashboard

### Testar Funcionalidades
- ✅ Visualizar dashboard
- ✅ Criar novo agendamento
- ✅ Listar agendamentos
- ✅ Editar agendamento
- ✅ Criar novo usuário (como ADM)
- ✅ Alternar tema claro/escuro

## 🔍 5. Verificar se está Funcionando

### Backend
```bash
# Teste se API está respondendo
curl http://localhost:8000/health
```

Deve retornar: `{"status":"healthy"}`

### Frontend
Abra `http://localhost:3000` no navegador

### Banco de Dados
No Supabase:
1. Vá em **Table Editor**
2. Verifique se as tabelas foram criadas:
   - profiles
   - appointments
   - appointment_history
   - notifications

## ⚙️ 6. Comandos Úteis

### Backend
```bash
# Ativar ambiente virtual
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Rodar servidor
uvicorn main:app --reload

# Rodar servidor em porta diferente
uvicorn main:app --reload --port 8001

# Ver documentação da API
# Acesse: http://localhost:8000/docs
```

### Frontend
```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Rodar versão de produção
npm run start

# Verificar erros de lint
npm run lint
```

## 🐛 Solução de Problemas Comuns

### Erro: "Module not found"
```bash
# Backend
pip install -r requirements.txt

# Frontend
npm install
```

### Erro: "Supabase connection failed"
- Verifique se as credenciais estão corretas no `.env`
- Verifique se o projeto Supabase está ativo
- Verifique sua conexão com internet

### Erro: "CORS error"
- Verifique se `ALLOWED_ORIGINS` no backend inclui `http://localhost:3000`
- Verifique se o backend está rodando

### Erro: "Token invalid"
- Faça logout e login novamente
- Verifique se `SECRET_KEY` é a mesma no backend

### Frontend não carrega
- Verifique se `.env.local` existe e está configurado
- Rode `npm run build` para verificar erros
- Limpe cache: `rm -rf .next` e `npm run dev`

### Backend não inicia
- Verifique se ambiente virtual está ativo
- Verifique se todas dependências foram instaladas
- Verifique logs de erro no terminal

## 📝 Próximos Passos

Após configurar o sistema localmente:

1. **Configurar SendGrid** (para e-mails)
   - Crie conta em [sendgrid.com](https://sendgrid.com)
   - Obtenha API Key
   - Adicione no `.env` do backend

2. **Configurar Twilio** (para WhatsApp)
   - Crie conta em [twilio.com](https://twilio.com)
   - Configure WhatsApp API
   - Adicione credenciais no `.env`

3. **Personalizar Sistema**
   - Ajuste cores em `tailwind.config.ts`
   - Personalize logo e nome
   - Ajuste validações conforme necessário

4. **Preparar para Deploy**
   - Leia o arquivo `DEPLOY.md`
   - Configure domínio
   - Configure VPS

## 🆘 Precisa de Ajuda?

### Logs e Debugging

Backend:
```bash
# Ver logs detalhados
uvicorn main:app --reload --log-level debug
```

Frontend:
```bash
# Ver erros no console do navegador
# Pressione F12 → Console
```

### Verificar Status

```bash
# Backend
curl http://localhost:8000/health

# Testar login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seu@email.com","password":"senha123"}'
```

## ✅ Checklist de Instalação

- [ ] Node.js instalado
- [ ] Python instalado
- [ ] Projeto Supabase criado
- [ ] Schema SQL executado no Supabase
- [ ] Backend: dependências instaladas
- [ ] Backend: `.env` configurado
- [ ] Backend: servidor rodando em localhost:8000
- [ ] Frontend: dependências instaladas
- [ ] Frontend: `.env.local` configurado
- [ ] Frontend: aplicação rodando em localhost:3000
- [ ] Primeiro usuário ADM criado
- [ ] Login funcionando
- [ ] Dashboard carregando
- [ ] Agendamentos funcionando

Tudo pronto! 🎉
