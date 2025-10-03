#!/bin/bash

# Script para parar o Sistema de Agendamento Médico

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Parando Sistema de Agendamento Médico...${NC}"
echo ""

# Função para parar processo
stop_process() {
    if [ -f "$1" ]; then
        PID=$(cat "$1")
        if ps -p $PID > /dev/null 2>&1; then
            echo -e "${YELLOW}   Parando processo $2 (PID: $PID)...${NC}"
            kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null
            echo -e "${GREEN}   ✓ $2 parado${NC}"
        else
            echo -e "${YELLOW}   ⚠️  Processo $2 não está rodando${NC}"
        fi
        rm -f "$1"
    fi
}

# Parar por PIDs salvos
if [ -d ".pids" ]; then
    stop_process ".pids/backend.pid" "Backend"
    stop_process ".pids/frontend.pid" "Frontend"
    rmdir .pids 2>/dev/null
fi

# Garantir que portas foram liberadas
echo -e "${YELLOW}   Verificando portas...${NC}"

if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}   Liberando porta 8000...${NC}"
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
fi

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}   Liberando porta 3000...${NC}"
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

echo ""
echo -e "${GREEN}✓ Sistema parado com sucesso!${NC}"
echo ""
