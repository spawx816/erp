#!/bin/bash
set -e

echo "===================================================="
echo " 🚀 INICIANDO DESPLIEGUE AUTOMÁTICO DE NEXUS ERP"
echo "===================================================="

# Ir a la raíz del proyecto
cd "$(dirname "$0")"

echo "📥 1. Obteniendo últimos cambios de GitHub..."
git fetch origin main
git reset --hard origin/main

echo "⚙️ 2. Instalando y configurando Backend..."
cd backend
npm install --production

# Iniciar o recargar con PM2
if command -v pm2 &> /dev/null; then
    pm2 reload nexus-erp || pm2 restart nexus-erp || pm2 start src/server.js --name "nexus-erp"
    pm2 save
else
    echo "⚠️ PM2 no está instalado globalmente. Instalando..."
    npm install -g pm2
    pm2 start src/server.js --name "nexus-erp"
    pm2 save
    pm2 startup
fi

echo "🎨 3. Instalando dependencias y compilando Frontend..."
cd ../frontend
npm install
npm run build

echo "===================================================="
echo " ✅ DESPLIEGUE EXITOSO EN https://erp.spawx.uk"
echo "===================================================="
