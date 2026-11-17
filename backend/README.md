# Backend Mayic

API REST construida con Flask. La capa de modelos usa SQLAlchemy ORM, las reglas de negocio están en `api/controllers/` y los endpoints HTTP en `api/routes/`.

## Desarrollo local

1. Instala Python 3.10 o superior y MariaDB.
2. Crea un entorno virtual e instala dependencias:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. Copia `.env.example` a `.env` y edita las variables. Configura `DATABASE_URL`, `JWT_SECRET_KEY` y una contraseña fuerte para `ADMIN_PASSWORD`; no compartas ni subas `.env`.

   ```powershell
   Copy-Item .env.example .env
   ```

   Para generar una clave aleatoria compatible con URL:

   ```powershell
   py -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

   Ejecuta el comando por separado para cada secreto. `DATABASE_URL` debe apuntar a MariaDB y usar las credenciales de esa base.
4. Aplica la migración inicial y carga el catálogo de demostración:

   ```powershell
   flask --app app db upgrade
   flask --app app seed
   flask --app app run
   ```

La API queda disponible en `http://localhost:5000/api`. El comando `seed` requiere `ADMIN_PASSWORD` al crear la cuenta inicial. Cambia cualquier credencial antes de exponer la aplicación.
En Docker, un proceso independiente revisa y libera cotizaciones vencidas cada 30 segundos (configurable con `QUOTE_EXPIRY_POLL_SECONDS`).

## Migraciones

Las migraciones versionadas están en `migrations/` y se ejecutan con `flask --app app db upgrade`. Para generar una migración después de cambiar modelos:

```powershell
flask --app app db migrate -m "describe el cambio"
flask --app app db upgrade
```

No uses `db.create_all()` para el despliegue: el esquema se controla mediante Alembic/Flask-Migrate.
Las opciones configurables del catálogo se guardan por producto en `customization_fields`; se editan desde Catálogo en el panel y la API pública las incluye en cada producto.
Las fotografías de MayC se administran desde **Fotografías propias**. Los archivos se guardan por categoría en `IMAGE_UPLOAD_FOLDER` y su índice/relación con productos se almacena en `product_images`. En Docker el directorio usa el volumen `mayi_eventos_product_images`, separado del volumen de comprobantes; reconstruir o publicar contenedores no elimina ese volumen. Haz copias de seguridad del volumen junto con MariaDB.

Las cargas admiten JPG, PNG y WebP (máximo 5 MB por archivo y 10 por lote); se mantienen privadas como borradores hasta publicarlas. El panel permite guardar el foco horizontal/vertical y el zoom de encuadre por fotografía. Las rutas `/api/images` requieren JWT de administración. La tienda solo recibe fotografías publicadas asociadas al producto, y las imágenes de `/api/public/images/{id}` no permiten escritura.

Desde **Catálogo y precios → Personalización**, también puedes subir una foto a cada alternativa (por ejemplo, un sabor o relleno). La foto queda asociada al producto y aparece como tarjeta seleccionable en la tienda. Pulsa **Guardar opciones** después de cargarla para vincularla a esa alternativa.

Al continuar desde el checkout, la tienda registra primero la solicitud en `POST /api/public/orders` y luego abre WhatsApp con el código de referencia. El administrador la encuentra en **Pedidos y pagos → Solicitudes web**. Estas solicitudes no reservan fecha ni se consideran cotizadas o confirmadas; los productos sin precio configurado se marcan para revisión manual. Los pedidos enviados anteriormente solo por WhatsApp no se importan automáticamente.

## API principal

- `POST /api/auth/login`
- `GET /api/dashboard`
- `GET|POST /api/customers`
- `GET|POST|PUT /api/catalog`
- `GET|POST /api/images`
- `PATCH|DELETE /api/images/{id}`
- `GET|PUT /api/images/{id}/file`
- `GET /api/public/images?category=FEATURED`
- `POST /api/public/orders` (solicitud de compra desde la tienda; sin autenticación)
- `GET|POST /api/orders`
- `POST /api/orders/{id}/proof`
- `POST /api/orders/{id}/confirm-deposit`
- `POST /api/orders/{id}/reject-proof`
- `POST /api/orders/{id}/settle`
- `GET /api/agenda?year=2026&month=11`
