# Guia de Deploy - Sistema de Agendamento Médico

Este guia explica como fazer o deploy do sistema em uma VPS.

## 📋 Pré-requisitos

- VPS com Ubuntu 20.04+ (ou similar)
- Domínio configurado (opcional, mas recomendado)
- Acesso SSH à VPS
- Conta no Supabase configurada

## 🔧 1. Configuração Inicial da VPS

### Conectar à VPS
```bash
ssh root@seu-servidor.com
```

### Atualizar sistema
```bash
apt update && apt upgrade -y
```

### Instalar dependências
```bash
# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt install -y nodejs

# Python 3.11+
apt install -y python3 python3-pip python3-venv

# Nginx
apt install -y nginx

# Certbot (SSL)
apt install -y certbot python3-certbot-nginx

# PM2 para gerenciar processos
npm install -g pm2
```

## 🗄️ 2. Configuração do Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. Vá em SQL Editor e execute o script `/workspace/database/schema.sql`
3. Configure Row Level Security (RLS) nas tabelas
4. Anote as credenciais:
   - Project URL
   - Anon/Public Key
   - Service Role Key

## 📦 3. Deploy do Backend (FastAPI)

### Clone o repositório
```bash
cd /var/www
git clone seu-repositorio.git medical-scheduling
cd medical-scheduling/backend
```

### Criar ambiente virtual
```bash
python3 -m venv venv
source venv/bin/activate
```

### Instalar dependências
```bash
pip install -r requirements.txt
```

### Configurar variáveis de ambiente
```bash
cp .env.example .env
nano .env
```

Preencha com suas credenciais:
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua-service-role-key
SECRET_KEY=$(openssl rand -hex 32)
SENDGRID_API_KEY=sua-api-key-sendgrid
TWILIO_ACCOUNT_SID=seu-account-sid
TWILIO_AUTH_TOKEN=seu-auth-token
ALLOWED_ORIGINS=https://seudominio.com,https://www.seudominio.com
```

### Iniciar com PM2
```bash
pm2 start "uvicorn main:app --host 0.0.0.0 --port 8000" --name medical-api
pm2 save
pm2 startup
```

## 🎨 4. Deploy do Frontend (Next.js)

### Ir para o diretório do frontend
```bash
cd /var/www/medical-scheduling/frontend
```

### Instalar dependências
```bash
npm install
```

### Configurar variáveis de ambiente
```bash
cp .env.example .env.local
nano .env.local
```

Preencha:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
NEXT_PUBLIC_API_URL=https://api.seudominio.com
```

### Build da aplicação
```bash
npm run build
```

### Iniciar com PM2
```bash
pm2 start npm --name medical-frontend -- start
pm2 save
```

## 🌐 5. Configuração do Nginx

### Criar configuração para o backend
```bash
nano /etc/nginx/sites-available/medical-api
```

Conteúdo:
```nginx
server {
    listen 80;
    server_name api.seudominio.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Criar configuração para o frontend
```bash
nano /etc/nginx/sites-available/medical-frontend
```

Conteúdo:
```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Ativar sites
```bash
ln -s /etc/nginx/sites-available/medical-api /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/medical-frontend /etc/nginx/sites-enabled/
```

### Testar e reiniciar Nginx
```bash
nginx -t
systemctl restart nginx
```

## 🔒 6. Configurar SSL (HTTPS)

```bash
certbot --nginx -d seudominio.com -d www.seudominio.com
certbot --nginx -d api.seudominio.com
```

Siga as instruções do Certbot.

## 🔄 7. Configurar Backup Automático

### Criar script de backup
```bash
nano /root/backup-medical.sh
```

Conteúdo:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/medical"
mkdir -p $BACKUP_DIR

# Backup do banco (via Supabase CLI ou pg_dump se self-hosted)
# Supabase faz backup automático, mas você pode exportar dados via API

# Backup dos arquivos
tar -czf $BACKUP_DIR/medical-$DATE.tar.gz /var/www/medical-scheduling

# Manter apenas últimos 30 dias
find $BACKUP_DIR -name "medical-*.tar.gz" -mtime +30 -delete

echo "Backup concluído: medical-$DATE.tar.gz"
```

### Tornar executável e agendar
```bash
chmod +x /root/backup-medical.sh

# Adicionar ao crontab (diário às 2h da manhã)
crontab -e
```

Adicionar linha:
```
0 2 * * * /root/backup-medical.sh >> /var/log/medical-backup.log 2>&1
```

## 📊 8. Monitoramento

### Ver logs do PM2
```bash
pm2 logs medical-api
pm2 logs medical-frontend
```

### Monitorar processos
```bash
pm2 monit
```

### Ver logs do Nginx
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 🔄 9. Atualização do Sistema

### Script de atualização
```bash
nano /root/update-medical.sh
```

Conteúdo:
```bash
#!/bin/bash
cd /var/www/medical-scheduling

# Pull das mudanças
git pull origin main

# Atualizar backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
pm2 restart medical-api

# Atualizar frontend
cd ../frontend
npm install
npm run build
pm2 restart medical-frontend

echo "Atualização concluída!"
```

```bash
chmod +x /root/update-medical.sh
```

## 🛡️ 10. Segurança Adicional

### Configurar Firewall
```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Desabilitar acesso root direto via SSH
```bash
nano /etc/ssh/sshd_config
```

Alterar:
```
PermitRootLogin no
```

```bash
systemctl restart sshd
```

### Configurar fail2ban
```bash
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban
```

## 📱 11. Configuração de Notificações

### SendGrid
1. Crie conta em [sendgrid.com](https://sendgrid.com)
2. Crie API Key
3. Verifique domínio de envio
4. Adicione API Key no `.env` do backend

### Twilio (WhatsApp)
1. Crie conta em [twilio.com](https://twilio.com)
2. Configure WhatsApp Business API
3. Obtenha credenciais
4. Adicione no `.env` do backend

## ✅ Checklist Pós-Deploy

- [ ] Banco de dados configurado no Supabase
- [ ] Backend rodando na porta 8000
- [ ] Frontend rodando na porta 3000
- [ ] Nginx configurado e funcionando
- [ ] SSL/HTTPS ativo
- [ ] Backups automáticos agendados
- [ ] Firewall configurado
- [ ] Notificações testadas
- [ ] Criar usuário ADM inicial
- [ ] Testar todas as funcionalidades

## 🆘 Solução de Problemas

### Backend não inicia
```bash
pm2 logs medical-api --lines 100
# Verificar se todas as dependências estão instaladas
# Verificar se variáveis de ambiente estão corretas
```

### Frontend não carrega
```bash
pm2 logs medical-frontend --lines 100
# Verificar build: npm run build
# Verificar variáveis de ambiente
```

### Erro de CORS
- Verificar ALLOWED_ORIGINS no backend
- Verificar se domínios estão corretos

### Banco de dados não conecta
- Verificar credenciais do Supabase
- Verificar se IP da VPS está permitido no Supabase

## 📞 Suporte

Para problemas técnicos, consulte os logs:
- Backend: `pm2 logs medical-api`
- Frontend: `pm2 logs medical-frontend`
- Nginx: `/var/log/nginx/error.log`
