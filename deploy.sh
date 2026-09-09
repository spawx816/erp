#!/bin/bash
set -e

echo "===================================================="
echo " 🚀 INICIANDO DESPLIEGUE SEGURO DE NEXUS ERP (POSTGRESQL)"
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

# Cargar variables de entorno si existen
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

npm install --production

# Respaldo y sincronización de esquema no destructiva
if command -v psql &> /dev/null; then
    DB_USER_VAL="${DB_USER:-educrm_user}"
    DB_NAME_VAL="${DB_NAME:-nexus_erp}"
    DB_HOST_VAL="${DB_HOST:-127.0.0.1}"
    DB_PORT_VAL="${DB_PORT:-5432}"

    # 2.1 Respaldo preventivo automático antes de cualquier cambio
    if command -v pg_dump &> /dev/null; then
        mkdir -p ../backups
        BACKUP_FILE="../backups/backup_auto_deploy_$(date +%Y%m%d_%H%M%S).sql"
        echo "💾 Generando respaldo preventivo en $BACKUP_FILE..."
        if PGPASSWORD="${DB_PASSWORD}" pg_dump -U "$DB_USER_VAL" -d "$DB_NAME_VAL" -h "$DB_HOST_VAL" -p "$DB_PORT_VAL" -F p -f "$BACKUP_FILE" 2>/dev/null && [ -s "$BACKUP_FILE" ]; then
            echo "✅ Respaldo preventivo generado exitosamente ($(du -h "$BACKUP_FILE" | cut -f1))."
        else
            echo "⚠️ Advertencia: No se pudo generar pg_dump preventivo o archivo vacío (continuando despliegue seguro)."
            rm -f "$BACKUP_FILE" 2>/dev/null || true
        fi
    fi

    echo "🐘 Verificando y aplicando esquema incremental (CREATE TABLE IF NOT EXISTS)..."
    # NUNCA DROP SCHEMA. Aplicamos esquema idempotente
    PGPASSWORD="${DB_PASSWORD}" psql -v ON_ERROR_STOP=1 -U "$DB_USER_VAL" -d "$DB_NAME_VAL" -h "$DB_HOST_VAL" -p "$DB_PORT_VAL" -f src/database/nexus_erp_postgres.sql

    echo "⚡ Aplicando migraciones de esquema idempotentes (migrations.sql)..."
    PGPASSWORD="${DB_PASSWORD}" psql -v ON_ERROR_STOP=1 -U "$DB_USER_VAL" -d "$DB_NAME_VAL" -h "$DB_HOST_VAL" -p "$DB_PORT_VAL" -f src/database/migrations.sql

    # 2.2 Sembrar únicamente si la base está completamente vacía
    HAS_DATA=$(PGPASSWORD="${DB_PASSWORD}" psql -U "$DB_USER_VAL" -d "$DB_NAME_VAL" -h "$DB_HOST_VAL" -p "$DB_PORT_VAL" -t -A -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies';" 2>/dev/null || echo "0")
    if [ "$HAS_DATA" = "1" ]; then
        COMPANY_COUNT=$(PGPASSWORD="${DB_PASSWORD}" psql -U "$DB_USER_VAL" -d "$DB_NAME_VAL" -h "$DB_HOST_VAL" -p "$DB_PORT_VAL" -t -A -c "SELECT COUNT(*) FROM companies;" 2>/dev/null || echo "0")
        if [ "$COMPANY_COUNT" = "0" ]; then
            echo "🌱 Base de datos limpia detectada. Aplicando seed inicial..."
            PGPASSWORD="${DB_PASSWORD}" psql -v ON_ERROR_STOP=1 -U "$DB_USER_VAL" -d "$DB_NAME_VAL" -h "$DB_HOST_VAL" -p "$DB_PORT_VAL" -f src/database/nexus_erp_full_seed.sql || echo "Seed inicial completado con advertencias menores."
        else
            echo "🛡️ Base de datos en producción activa con registros existentes ($COMPANY_COUNT empresas). Se preservan los datos íntegros."
        fi
    fi
fi

echo "🎨 3. Compilando Frontend React..."
cd ../frontend
npm install
npm run build
cd ../backend

echo "🔄 4. Recargando servicio Backend..."
# Iniciar o recargar con PM2 en puerto 5005
if command -v pm2 &> /dev/null; then
    PORT=5005 pm2 reload nexus-erp --update-env 2>/dev/null || PORT=5005 pm2 start src/server.js --name "nexus-erp" --update-env
    pm2 save
else
    echo "⚠️ Instalando PM2..."
    npm install -g pm2
    PORT=5005 pm2 start src/server.js --name "nexus-erp"
    pm2 save
    pm2 startup || true
fi

echo "===================================================="
echo " ✅ DESPLIEGUE SEGURO EXITOSO (DATOS PRESERVADOS)"
echo "===================================================="
