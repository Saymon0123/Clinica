#!/bin/bash

# Script de Inicialização do Sistema de Agendamento Médico
# Autor: Sistema Automatizado
# Descrição: Inicia backend e frontend automaticamente

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Sistema de Agendamento Médico - Inicialização  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Função para verificar se arquivo existe
check_file() {
    if [ ! -f "$1" ]; then
        echo -e "${RED}❌ Arquivo não encontrado: $1${NC}"
        echo -e "${YELLOW}⚠️  Por favor, crie o arquivo seguindo as instruções em START.md${NC}"
        exit 1
    fi
}

# Função para verificar se porta está em uso
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${YELLOW}⚠️  Porta $1 já está em uso${NC}"
        return 1
    fi
    return 0
}

echo -e "${BLUE}📋 Verificando configurações...${NC}"

# Verificar arquivos de configuração
check_file "backend/.env"
check_file "frontend/.env.local"

echo -e "${GREEN}✓ Arquivos de configuração encontrados${NC}"
echo ""

# Verificar portas
echo -e "${BLUE}🔍 Verificando portas disponíveis...${NC}"

if ! check_port 8000; then
    echo -e "${YELLOW}   Tentando parar processo na porta 8000...${NC}"
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

if ! check_port 3000; then
    echo -e "${YELLOW}   Tentando parar processo na porta 3000...${NC}"
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

echo -e "${GREEN}✓ Portas 8000 e 3000 disponíveis${NC}"
echo ""

# Adicionar PATH
export PATH="$HOME/.local/bin:$PATH"

# Iniciar Backend
echo -e "${BLUE}🚀 Iniciando Backend (FastAPI)...${NC}"
cd backend

# Verificar se dependências estão instaladas
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Instalando dependências do backend...${NC}"
    pip install --user fastapi uvicorn[standard] python-dotenv pydantic pydantic-settings supabase python-jose[cryptography] passlib[bcrypt] python-multipart sendgrid twilio openpyxl reportlab
fi

# Iniciar backend em background
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload > ../logs/backend.log 2>&1 &
BACKEND_PID=$!

sleep 3

# Verificar se backend iniciou
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Erro ao iniciar backend${NC}"
    echo -e "${YELLOW}   Verifique os logs em: logs/backend.log${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Backend rodando em http://localhost:8000${NC}"
echo -e "${GREEN}   PID: $BACKEND_PID${NC}"
echo ""

# Iniciar Frontend
echo -e "${BLUE}🎨 Iniciando Frontend (Next.js)...${NC}"
cd ../frontend

# Verificar se node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Instalando dependências do frontend...${NC}"
    npm install
fi

# Iniciar frontend em background
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 5

# Verificar se frontend iniciou
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${RED}❌ Erro ao iniciar frontend${NC}"
    echo -e "${YELLOW}   Verifique os logs em: logs/frontend.log${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Frontend rodando em http://localhost:3000${NC}"
echo -e "${GREEN}   PID: $FRONTEND_PID${NC}"
echo ""

# Salvar PIDs
cd ..
mkdir -p .pids
echo $BACKEND_PID > .pids/backend.pid
echo $FRONTEND_PID > .pids/frontend.pid

echo -e "${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✓ Sistema iniciado com sucesso!          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📊 Informações:${NC}"
echo -e "   • Backend:  http://localhost:8000"
echo -e "   • Frontend: http://localhost:3000"
echo -e "   • API Docs: http://localhost:8000/docs"
echo ""
echo -e "${BLUE}📝 Logs:${NC}"
echo -e "   • Backend:  tail -f logs/backend.log"
echo -e "   • Frontend: tail -f logs/frontend.log"
echo ""
echo -e "${BLUE}🛑 Para parar:${NC}"
echo -e "   • Execute: ./stop.sh"
echo -e "   • Ou: kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo -e "${YELLOW}⚠️  Primeiro acesso?${NC}"
echo -e "   1. Abra http://localhost:3000"
echo -e "   2. Clique em 'Criar conta'"
echo -e "   3. Crie usuário com função 'Administrador'"
echo ""
echo -e "${GREEN}Pressione Ctrl+C para parar os servidores${NC}"
echo ""

# Manter script rodando
wait
