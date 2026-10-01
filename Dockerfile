# ==============================================================================
# Dockerfile - Sistema de Gestión de Inventario para Panadería (TFG UNIGRAN)
# ==============================================================================

# 1. Imagen base oficial de Node.js (LTS Slim)
FROM node:20-slim

# 2. Instalar dependencias para compilar módulos nativos (sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# 3. Establecer directorio de trabajo en el contenedor
WORKDIR /app

# 4. Copiar archivos de definición de paquetes
COPY package*.json ./

# 5. Instalar dependencias compilando sqlite3 para la versión de GLIBC del contenedor
RUN npm install --omit=dev --build-from-source=sqlite3

# 6. Copiar el código fuente y archivos de la aplicación
COPY . .

# 7. Crear directorio para persistencia de la base de datos SQLite
RUN mkdir -p /app/data

# 8. Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/panaderia.db

# 9. Exponer el puerto del servidor HTTP
EXPOSE 3000

# 10. Comando de arranque de la aplicación
CMD ["node", "src/server.js"]
