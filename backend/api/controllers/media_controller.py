import re
from pathlib import Path
from uuid import uuid4

from flask import current_app
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from api.extensions import db
from api.models import CatalogItem, ProductImage
from api.controllers.mayic_controller import BusinessError


IMAGE_CATEGORIES = {"CAKE", "SAVORY", "DESSERT", "DRINK", "TABLE", "FEATURED"}
CATEGORY_TO_PRODUCT = {
    "CAKE": "CAKE",
    "SAVORY": "SAVORY",
    "DESSERT": "DESSERT",
    "DRINK": "DRINK",
    "TABLE": "TABLE",
}
MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_BATCH_SIZE = 10
IMAGE_SIGNATURES = {
    "jpg": (b"\xff\xd8\xff", "image/jpeg"),
    "png": (b"\x89PNG\r\n\x1a\n", "image/png"),
}


def _read_image(upload: FileStorage) -> tuple[bytes, str, str]:
    original_name = secure_filename(upload.filename or "")
    if not original_name:
        raise BusinessError("Cada fotografía debe tener un nombre válido.")
    extension = Path(original_name).suffix.lower().lstrip(".")
    if extension == "jpeg":
        extension = "jpg"
    if extension not in {"jpg", "png", "webp"}:
        raise BusinessError("Usa fotografías JPG, PNG o WebP.")
    content = upload.stream.read(MAX_IMAGE_SIZE + 1)
    if not content:
        raise BusinessError("No se pudo leer una de las fotografías.")
    if len(content) > MAX_IMAGE_SIZE:
        raise BusinessError("Cada fotografía debe pesar máximo 5 MB.")

    if extension == "webp":
        valid_signature = (
            len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
        )
        content_type = "image/webp"
    else:
        signature, content_type = IMAGE_SIGNATURES[extension]
        valid_signature = content.startswith(signature)
    if not valid_signature:
        raise BusinessError("El contenido del archivo no coincide con una imagen JPG, PNG o WebP.")
    return content, extension, content_type


def _validate_assignment(category: str, catalog_item_id: int | None) -> CatalogItem | None:
    if category not in IMAGE_CATEGORIES:
        raise BusinessError("Selecciona una categoría de fotografías válida.")
    if category == "FEATURED":
        if catalog_item_id is not None:
            raise BusinessError("Las fotografías principales no se asocian a un producto.")
        return None
    if catalog_item_id is None:
        return None
    item = db.session.get(CatalogItem, catalog_item_id)
    if not item:
        raise BusinessError("El producto seleccionado no existe.", 404)
    if item.category != CATEGORY_TO_PRODUCT[category]:
        raise BusinessError("La categoría de la fotografía no coincide con la del producto.")
    return item


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:48] or "fotografia"


def _storage_key(category: str, item: CatalogItem | None, filename: str, extension: str) -> str:
    base = item.name if item else Path(filename).stem
    return f"{category.lower()}/{_slug(base)}-{uuid4().hex[:12]}.{extension}"


def serialize_image(image: ProductImage) -> dict:
    return {
        "id": image.id,
        "catalog_item_id": image.catalog_item_id,
        "product_name": image.catalog_item.name if image.catalog_item else None,
        "category": image.category,
        "original_name": image.original_name,
        "content_type": image.content_type,
        "position_x": image.position_x,
        "position_y": image.position_y,
        "zoom": image.zoom,
        "is_published": image.is_published,
        "url": (
            f"/api/public/images/{image.id}?v="
            f"{image.storage_key.rsplit('/', 1)[-1].rsplit('-', 1)[-1].rsplit('.', 1)[0]}"
            if image.is_published else None
        ),
        "created_at": image.created_at.isoformat(),
    }


def list_images(category: str | None = None) -> list[ProductImage]:
    query = db.select(ProductImage).order_by(ProductImage.category, ProductImage.id)
    if category:
        if category not in IMAGE_CATEGORIES:
            raise BusinessError("La categoría de fotografías no es válida.")
        query = query.where(ProductImage.category == category)
    return db.session.execute(query).scalars().all()


def upload_images(
    uploads: list[FileStorage], category: str, catalog_item_id: int | None
) -> list[ProductImage]:
    if not uploads or len(uploads) > MAX_BATCH_SIZE:
        raise BusinessError("Selecciona entre 1 y 10 fotografías por carga.")
    category = category.strip().upper()
    item = _validate_assignment(category, catalog_item_id)
    prepared = [(upload, *_read_image(upload)) for upload in uploads]
    saved_paths: list[Path] = []
    images: list[ProductImage] = []
    try:
        root = Path(current_app.config["IMAGE_UPLOAD_FOLDER"])
        for upload, content, extension, content_type in prepared:
            key = _storage_key(category, item, upload.filename or "", extension)
            path = root / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            saved_paths.append(path)
            image = ProductImage(
                catalog_item_id=item.id if item else None,
                category=category,
                storage_key=key,
                original_name=secure_filename(upload.filename or ""),
                content_type=content_type,
                is_published=False,
            )
            db.session.add(image)
            images.append(image)
        db.session.commit()
        return images
    except Exception:
        db.session.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        raise


def update_image(image_id: int, data: dict) -> ProductImage:
    image = db.session.get(ProductImage, image_id)
    if not image:
        raise BusinessError("La fotografía no existe.", 404)
    category = str(data.get("category", image.category)).strip().upper()
    raw_item_id = data.get("catalog_item_id", image.catalog_item_id)
    if raw_item_id in (None, ""):
        item_id = None
    else:
        try:
            item_id = int(raw_item_id)
        except (TypeError, ValueError):
            raise BusinessError("El producto seleccionado no es válido.")
    item = _validate_assignment(category, item_id)
    image.category = category
    image.catalog_item_id = item.id if item else None
    if "is_published" in data:
        published = data["is_published"]
        if not isinstance(published, bool):
            raise BusinessError("El estado de publicación no es válido.")
        image.is_published = published
    for field, minimum, maximum in (
        ("position_x", 0, 100),
        ("position_y", 0, 100),
        ("zoom", 100, 200),
    ):
        if field in data:
            value = data[field]
            if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
                raise BusinessError("El encuadre de la fotografía no es válido.")
            setattr(image, field, value)
    db.session.commit()
    return image


def replace_image(image_id: int, upload: FileStorage) -> ProductImage:
    image = db.session.get(ProductImage, image_id)
    if not image:
        raise BusinessError("La fotografía no existe.", 404)
    content, extension, content_type = _read_image(upload)
    key = _storage_key(image.category, image.catalog_item, upload.filename or "", extension)
    root = Path(current_app.config["IMAGE_UPLOAD_FOLDER"])
    new_path = root / key
    new_path.parent.mkdir(parents=True, exist_ok=True)
    new_path.write_bytes(content)
    old_key = image.storage_key
    try:
        image.storage_key = key
        image.original_name = secure_filename(upload.filename or "")
        image.content_type = content_type
        db.session.commit()
    except Exception:
        db.session.rollback()
        new_path.unlink(missing_ok=True)
        raise
    (root / old_key).unlink(missing_ok=True)
    return image


def delete_image(image_id: int) -> None:
    image = db.session.get(ProductImage, image_id)
    if not image:
        raise BusinessError("La fotografía no existe.", 404)
    path = Path(current_app.config["IMAGE_UPLOAD_FOLDER"]) / image.storage_key
    db.session.delete(image)
    db.session.commit()
    path.unlink(missing_ok=True)
