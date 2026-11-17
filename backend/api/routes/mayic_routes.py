from datetime import datetime
from pathlib import Path
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from werkzeug.utils import secure_filename

from api.controllers import mayic_controller as service
from api.controllers import media_controller as media_service
from api.extensions import db
from api.models import AdminUser, CatalogItem, Customer, Order, ProductImage

bp = Blueprint("mayic_api", __name__)
ALLOWED_PROOF_EXTENSIONS = {"png", "jpg", "jpeg", "pdf"}


def _admin_id() -> int:
    return int(get_jwt_identity())


def _error(error: service.BusinessError):
    return jsonify({"message": str(error)}), error.status_code


@bp.errorhandler(service.BusinessError)
def handle_business_error(error):
    return _error(error)


@bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    user = service.login(str(data.get("email", "")), str(data.get("password", "")))
    token = create_access_token(identity=str(user.id))
    return jsonify(
        {
            "access_token": token,
            "user": {"id": user.id, "name": user.name, "email": user.email},
        }
    )


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@bp.get("/dashboard")
@jwt_required()
def dashboard():
    return jsonify(service.dashboard_summary())


@bp.get("/customers")
@jwt_required()
def customers():
    return jsonify(service.list_customers())


@bp.post("/customers")
@jwt_required()
def create_customer():
    customer = service.save_customer(request.get_json(silent=True) or {})
    db.session.commit()
    return jsonify(service.serialize_customer(customer)), 201


@bp.get("/catalog")
@jwt_required()
def catalog():
    return jsonify(service.list_catalog())


@bp.get("/public/catalog")
def public_catalog():
    return jsonify(service.list_public_catalog())


@bp.post("/public/orders")
def create_public_order():
    order = service.create_store_order(request.get_json(silent=True) or {})
    return jsonify(service.serialize_order(order)), 201


@bp.get("/images")
@jwt_required()
def images():
    category = request.args.get("category")
    return jsonify([media_service.serialize_image(image) for image in media_service.list_images(category)])


@bp.post("/images")
@jwt_required()
def upload_images():
    category = str(request.form.get("category", ""))
    raw_item_id = request.form.get("catalog_item_id")
    try:
        item_id = int(raw_item_id) if raw_item_id else None
    except ValueError:
        raise service.BusinessError("El producto seleccionado no es válido.")
    uploaded = request.files.getlist("images")
    saved = media_service.upload_images(uploaded, category, item_id)
    return jsonify([media_service.serialize_image(image) for image in saved]), 201


@bp.patch("/images/<int:image_id>")
@jwt_required()
def update_image(image_id: int):
    image = media_service.update_image(image_id, request.get_json(silent=True) or {})
    return jsonify(media_service.serialize_image(image))


@bp.put("/images/<int:image_id>/file")
@jwt_required()
def replace_image(image_id: int):
    uploaded = request.files.get("image")
    if not uploaded or not uploaded.filename:
        raise service.BusinessError("Selecciona la nueva fotografía.")
    image = media_service.replace_image(image_id, uploaded)
    return jsonify(media_service.serialize_image(image))


@bp.delete("/images/<int:image_id>")
@jwt_required()
def delete_image(image_id: int):
    media_service.delete_image(image_id)
    return jsonify({"message": "Fotografía eliminada."})


@bp.get("/images/<int:image_id>/file")
@jwt_required()
def get_admin_image(image_id: int):
    image = db.session.get(ProductImage, image_id)
    if not image:
        raise service.BusinessError("La fotografía no existe.", 404)
    response = send_from_directory(
        current_app.config["IMAGE_UPLOAD_FOLDER"],
        image.storage_key,
        mimetype=image.content_type,
        max_age=0,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return response


@bp.get("/public/images")
def public_images():
    category = str(request.args.get("category", "")).strip().upper()
    if category not in media_service.IMAGE_CATEGORIES:
        raise service.BusinessError("Selecciona una categoría de fotografías válida.")
    items = db.session.execute(
        db.select(ProductImage)
        .where(
            ProductImage.category == category,
            ProductImage.is_published.is_(True),
        )
        .order_by(ProductImage.id)
    ).scalars().all()
    return jsonify([media_service.serialize_image(image) for image in items])


@bp.get("/public/images/<int:image_id>")
def get_public_image(image_id: int):
    image = db.session.get(ProductImage, image_id)
    if (
        not image
        or not image.is_published
        or (image.catalog_item is not None and not image.catalog_item.active)
    ):
        raise service.BusinessError("La fotografía no está publicada.", 404)
    return send_from_directory(
        current_app.config["IMAGE_UPLOAD_FOLDER"],
        image.storage_key,
        mimetype=image.content_type,
        max_age=3600,
    )


@bp.post("/catalog")
@jwt_required()
def create_catalog_item():
    item = service.save_catalog_item(request.get_json(silent=True) or {})
    return jsonify(service.serialize_catalog_item(item)), 201


@bp.put("/catalog/<int:item_id>")
@jwt_required()
def update_catalog_item(item_id: int):
    item = service.save_catalog_item(request.get_json(silent=True) or {}, item_id)
    return jsonify(service.serialize_catalog_item(item))


@bp.get("/orders")
@jwt_required()
def orders():
    return jsonify(service.list_orders(request.args.get("status")))


@bp.post("/orders")
@jwt_required()
def create_order():
    order = service.create_quote(request.get_json(silent=True) or {})
    return jsonify(service.serialize_order(order)), 201


@bp.post("/orders/<int:order_id>/proof")
@jwt_required()
def upload_proof(order_id: int):
    order = db.session.get(Order, order_id)
    if not order:
        raise service.BusinessError("El pedido no existe.", 404)
    if order.status not in {"QUOTE_PENDING", "PAYMENT_REVIEW"}:
        raise service.BusinessError("El pedido no admite nuevos soportes de pago.")
    uploaded = request.files.get("proof")
    if not uploaded or not uploaded.filename:
        raise service.BusinessError("Selecciona el comprobante de pago.")
    original_name = secure_filename(uploaded.filename)
    extension = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if extension not in ALLOWED_PROOF_EXTENSIONS:
        raise service.BusinessError("El comprobante debe ser PNG, JPG, JPEG o PDF.")
    filename = f"{uuid4().hex}.{extension}"
    upload_dir = Path(current_app.config["UPLOAD_FOLDER"])
    upload_dir.mkdir(parents=True, exist_ok=True)
    uploaded.save(upload_dir / filename)
    order.proof_path = filename
    order.proof_reference = str(request.form.get("reference", "")).strip() or None
    order.status = "PAYMENT_REVIEW"
    order.rejection_reason = None
    db.session.commit()
    return jsonify(service.serialize_order(order))


@bp.get("/orders/<int:order_id>/proof")
@jwt_required()
def get_proof(order_id: int):
    order = db.session.get(Order, order_id)
    if not order or not order.proof_path:
        raise service.BusinessError("El comprobante no existe.", 404)
    return send_from_directory(current_app.config["UPLOAD_FOLDER"], order.proof_path)


@bp.post("/orders/<int:order_id>/confirm-deposit")
@jwt_required()
def confirm_deposit(order_id: int):
    order = service.confirm_deposit(order_id, _admin_id())
    return jsonify(service.serialize_order(order))


@bp.post("/orders/<int:order_id>/reject-proof")
@jwt_required()
def reject_proof(order_id: int):
    data = request.get_json(silent=True) or {}
    order = service.reject_proof(order_id, str(data.get("reason", "")))
    return jsonify(service.serialize_order(order))


@bp.post("/orders/<int:order_id>/settle")
@jwt_required()
def settle_order(order_id: int):
    order = service.settle_order(order_id, _admin_id(), request.get_json(silent=True) or {})
    return jsonify(service.serialize_order(order))


@bp.get("/agenda")
@jwt_required()
def agenda():
    try:
        year = int(request.args.get("year", datetime.now().year))
        month = int(request.args.get("month", datetime.now().month))
    except ValueError:
        raise service.BusinessError("El año y el mes deben ser números.")
    return jsonify(service.agenda_month(year, month))


@bp.errorhandler(413)
def file_too_large(_error):
    return jsonify({"message": "La carga supera el tamaño máximo permitido."}), 413
