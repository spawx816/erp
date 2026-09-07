#!/bin/bash
set -e

echo "===================================================="
echo " 🚀 INICIANDO DESPLIEGUE AUTOMÁTICO DE NEXUS ERP (POSTGRESQL)"
echo "===================================================="

# Ir a la raíz del proyecto
cd "$(dirname "$0")"

echo "📥 1. Obteniendo últimos cambios de GitHub..."
git fetch origin main
git reset --hard origin/main

echo "⚙️ 2. Configurando entorno y dependencias Backend..."
cd backend

if [ ! -f .env ]; then
    echo "📄 Creando archivo .env inicial..."
    cp .env.example .env
fi

npm install --production

# Importar esquema y dataset completo si PostgreSQL está listo
if command -v psql &> /dev/null; then
    echo "🐘 Sincronizando dataset completo en PostgreSQL..."
    PGPASSWORD='NuevaPasswordSegura' psql -U educrm_user -d nexus_erp -h localhost -f src/database/nexus_erp_postgres.sql 2>/dev/null || true
    PGPASSWORD='NuevaPasswordSegura' psql -U educrm_user -d nexus_erp -h localhost -f src/database/nexus_erp_full_seed.sql 2>/dev/null || true
fi

# Iniciar o recargar con PM2 en puerto 5005
if command -v pm2 &> /dev/null; then
    pm2 delete nexus-erp 2>/dev/null || true
    PORT=5005 pm2 start src/server.js --name "nexus-erp" --update-env
    pm2 save
else
    echo "⚠️ Instalando PM2..."
    npm install -g pm2
    PORT=5005 pm2 start src/server.js --name "nexus-erp"
    pm2 save
    pm2 startup
fi

echo "🎨 3. Compilando Frontend React..."
cd ../frontend
npm install
npm run build

echo "===================================================="
echo " ✅ DESPLIEGUE EXITOSO CON POSTGRESQL EN https://erp.spawx.uk"
echo "===================================================="
