# Mayic — Tienda y gestión de eventos

Aplicación web responsiva para la tienda de clientes y la administración de Casa de Eventos y Pastelería Mayic.

## Funcionalidades

- Catálogo público con personalización de productos, imágenes de sabores y rellenos, carrito y solicitudes por WhatsApp.
- Registro de solicitudes web para que aparezcan en el panel; enviar una solicitud no confirma ni reserva una fecha.
- Administración de clientes, catálogo, pedidos, pagos, fotografías y agenda.
- Cotizaciones con precios validados en el servidor, anticipo del 50 % y vigencia de 48 horas.
- Confirmación manual de anticipos y validación de capacidad de agenda.

## Arquitectura

```text
web_admin/                 React + TypeScript + Vite
backend/                   API REST Flask
  api/models/              SQLAlchemy ORM
  api/controllers/         Reglas de negocio (MVC)
  api/routes/              Endpoints HTTP
  migrations/              Flask-Migrate / Alembic
docker-compose.yml         MariaDB + API + tienda y panel web
```

Los precios y reglas de negocio se validan en el servidor. La base de datos y los archivos cargados persisten en volúmenes Docker.

## Requisitos

- Docker Desktop con Docker Compose v2.
- Git, si vas a clonar el proyecto.

## Inicio local con Docker

1. En PowerShell, desde la raíz del proyecto, crea tu archivo local de variables:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Edita `.env`. Define contraseñas distintas para `DB_ROOT_PASSWORD`, `DB_PASSWORD` y `ADMIN_PASSWORD`, además de una clave secreta para `JWT_SECRET_KEY`. Para generar un valor aleatorio seguro en PowerShell:

   ```powershell
   py -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

   Ejecuta el comando por separado para cada secreto. No uses los valores de otra instalación ni compartas el archivo `.env`.

3. Inicia los servicios:

   ```powershell
   docker compose up --build
   ```

4. Abre:
   - Tienda: `http://localhost`
   - Panel: `http://localhost:8080/admin/login`
   - API: `http://localhost:5000/api`

El usuario inicial usa `ADMIN_EMAIL` y `ADMIN_PASSWORD`. El contenedor de backend aplica migraciones y carga el catálogo de demostración al iniciar. La contraseña se utiliza al crear la cuenta por primera vez; cambiar `.env` después no restablece una cuenta existente.

## Persistencia y respaldos

MariaDB, las imágenes de productos y los comprobantes de pago viven en volúmenes Docker separados. `docker compose down` conserva esos volúmenes. **No ejecutes `docker compose down -v`** salvo que quieras eliminar permanentemente esos datos. Haz y prueba respaldos antes de cambiar de equipo o modificar la instalación.

Los datos de clientes, pedidos, comprobantes e imágenes de la instancia local no forman parte del código que se debe publicar. No los agregues al repositorio.

## Desarrollo y pruebas

### Backend

Sigue [backend/README.md](backend/README.md) para configurar el entorno local, MariaDB y migraciones. Para ejecutar las pruebas:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pytest
```

Las pruebas usan SQLite temporal y no necesitan una base de datos MariaDB.

### Frontend

```powershell
cd web_admin
npm ci
npm run dev
```

Para validar la compilación de producción ejecuta `npm run build`. Configura `VITE_API_URL` si la API no está disponible en el mismo origen.

## Antes de publicar

- No subas `.env`, bases de datos, imágenes, comprobantes, `node_modules`, entornos virtuales ni compilaciones. `.gitignore` excluye estos elementos.
- Revisa los archivos que vas a subir con `git status` y confirma que no haya información de clientes ni secretos.
- Configura GitHub Actions para comprobar las pruebas del backend y la compilación web en cada cambio.
- Este repositorio no incluye una licencia; define la licencia apropiada antes de permitir reutilización del código.
- Si el repositorio será público, revisa primero que tengas autorización para publicar el código, contenido visual y datos incluidos. Para un proyecto comercial con contenido propio, considera mantenerlo privado.
