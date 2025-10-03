# 🏥 Sistema de Agendamento Médico

<div align="center">

![Status](https://img.shields.io/badge/Status-Completo-success?style=for-the-badge)
![Version](https://img.shields.io/badge/Version-1.0.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)

**Sistema web completo para gerenciamento de agendamentos médicos**

[🚀 Início Rápido](#-início-rápido) • [📚 Documentação](#-documentação) • [✨ Funcionalidades](#-funcionalidades) • [🛠️ Tecnologias](#️-tecnologias)

</div>

---

## 📖 Sobre o Projeto

Sistema profissional desenvolvido para clínicas médicas gerenciarem consultas e exames com eficiência. Controle total de agendamentos, prevenção automática de conflitos, notificações e relatórios completos.

### 🎯 Principais Benefícios

✅ **Zero Conflitos** - Sistema impede agendamentos duplicados automaticamente  
✅ **Controle de Acesso** - ADM e Funcionários com permissões distintas  
✅ **Notificações Automáticas** - E-mail e WhatsApp integrados  
✅ **Relatórios Profissionais** - Exportação em Excel, PDF e CSV  
✅ **Interface Moderna** - Design responsivo com tema claro/escuro  

---

## ✨ Funcionalidades

<table>
<tr>
<td width="50%">

### 🔐 Autenticação Completa
- ✅ Login seguro com JWT
- ✅ Registro com validação
- ✅ Recuperação de senha
- ✅ Confirmação por e-mail
- ✅ Sessões persistentes

</td>
<td width="50%">

### 👥 Gestão de Usuários
- ✅ Dois níveis: ADM e Funcionário
- ✅ CRUD completo (ADM)
- ✅ Perfis com especialidade
- ✅ Controle de permissões
- ✅ Histórico de ações

</td>
</tr>
<tr>
<td width="50%">

### 📅 Agendamentos Inteligentes
- ✅ Consultas e Exames
- ✅ Prevenção de conflitos
- ✅ 4 status diferentes
- ✅ Validação de horários
- ✅ Edição e cancelamento

</td>
<td width="50%">

### 📊 Dashboard e Relatórios
- ✅ Estatísticas em tempo real
- ✅ Filtros avançados
- ✅ Exportação múltipla
- ✅ Gráficos visuais
- ✅ Histórico completo

</td>
</tr>
</table>

---

## 🛠️ Tecnologias

### Backend
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat-square&logo=postgresql&logoColor=white)

### Frontend
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)

### Integrações
![SendGrid](https://img.shields.io/badge/SendGrid-0078D7?style=flat-square)
![Twilio](https://img.shields.io/badge/Twilio-F22F46?style=flat-square&logo=twilio&logoColor=white)

---

## 🚀 Início Rápido

### Opção 1: Automatizado (Recomendado) ⚡

```bash
# 1. Configure o Supabase (ver START.md)
# 2. Crie os arquivos .env
# 3. Execute:
./start.sh
```

### Opção 2: Manual

```bash
# Backend (Terminal 1)
cd backend
pip install --user fastapi uvicorn[standard] python-dotenv pydantic supabase
python3 -m uvicorn main:app --reload

# Frontend (Terminal 2)
cd frontend
npm install
npm run dev
```

**Acesse:** http://localhost:3000

---

## 📚 Documentação

| Documento | Descrição |
|-----------|-----------|
| [📘 START.md](START.md) | **Guia de início rápido** - Comece aqui! |
| [📗 SETUP.md](SETUP.md) | Instalação detalhada passo a passo |
| [📙 DEPLOY.md](DEPLOY.md) | Deploy em VPS para produção |
| [📕 PROJETO-COMPLETO.md](PROJETO-COMPLETO.md) | Documentação técnica completa |
| [📋 RESUMO-EXECUTIVO.md](RESUMO-EXECUTIVO.md) | Visão executiva do projeto |
| [📁 ARQUIVOS.md](ARQUIVOS.md) | Lista de todos os arquivos |

---

## 📊 Estrutura do Projeto

```
medical-scheduling/
├── 📁 backend/          # API FastAPI
│   ├── main.py         # Entry point
│   ├── app/
│   │   ├── routers/    # Rotas da API
│   │   ├── models.py   # Validação de dados
│   │   └── auth.py     # Autenticação JWT
│   └── requirements.txt
│
├── 📁 frontend/         # Aplicação Next.js
│   ├── src/
│   │   ├── app/        # Páginas (App Router)
│   │   ├── components/ # Componentes React
│   │   ├── lib/        # Utilitários
│   │   └── store/      # Estado global
│   └── package.json
│
├── 📁 database/
│   └── schema.sql      # Schema PostgreSQL
│
├── 📄 START.md         # ⭐ Comece aqui
├── 🔧 start.sh         # Script de inicialização
└── 🔧 stop.sh          # Script para parar
```

---

## 🎨 Screenshots

### Dashboard
```
┌─────────────────────────────────────────────────────────┐
│  🏥 MedSchedule               🔔  🌙                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Bem-vindo, Dr. João! 👋                                │
│  Painel completo de administração do sistema            │
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ 📅 Total     │ │ ⏰ Hoje      │ │ 📈 Próximos  │   │
│  │ 127          │ │ 8            │ │ 24           │   │
│  └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                         │
│  Status dos Agendamentos                                │
│  ✅ Confirmados: 45  ⏳ Pendentes: 12                   │
│  ❌ Cancelados: 5    ✓ Concluídos: 65                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🔐 Segurança

- 🛡️ **Row Level Security** - Segurança a nível de banco
- 🔑 **JWT Tokens** - Autenticação moderna e segura
- 🔒 **HTTPS** - Comunicação criptografada
- ✅ **Validação** - Em todas as camadas (frontend + backend)
- 🚫 **SQL Injection** - Proteção completa

---

## 📈 Performance

- ⚡ API responde em **< 100ms**
- ⚡ Frontend carrega em **< 2s**
- ⚡ Suporta **centenas de usuários** simultâneos
- ⚡ Banco otimizado com **índices**

---

## 🤝 Contribuindo

Este é um projeto proprietário. Para sugestões ou melhorias, entre em contato.

---

## 📝 Licença

Proprietary - Todos os direitos reservados © 2025

---

## 🆘 Suporte

### Problemas Comuns

<details>
<summary>❌ Backend não inicia</summary>

```bash
# Verificar dependências
pip install --user -r backend/requirements.txt

# Verificar .env
cat backend/.env

# Ver logs
tail -f logs/backend.log
```
</details>

<details>
<summary>❌ Frontend não carrega</summary>

```bash
# Reinstalar dependências
cd frontend
rm -rf node_modules .next
npm install

# Verificar .env.local
cat .env.local
```
</details>

<details>
<summary>❌ Erro de conexão Supabase</summary>

- ✅ Verifique se executou o schema.sql
- ✅ Verifique credenciais no .env
- ✅ Use anon key no frontend, não service_role
</details>

---

## 🎯 Próximos Passos

1. ✅ [Ler START.md](START.md) - Guia de início
2. ✅ Configurar Supabase
3. ✅ Criar arquivos .env
4. ✅ Executar `./start.sh`
5. ✅ Criar primeiro usuário ADM
6. ✅ Explorar o sistema!

---

<div align="center">

**Desenvolvido com ❤️ para clínicas modernas**

[⬆ Voltar ao topo](#-sistema-de-agendamento-médico)

</div>
