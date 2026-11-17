from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
import os
import time
from uuid import uuid4

from flask import current_app
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from api.extensions import db
from api.models import AdminUser, CatalogItem, Customer, DailyCapacity, Order, Payment, ProductImage

PENDING_STATUSES = ("QUOTE_PENDING", "PAYMENT_REVIEW")
CONFIRMED_STATUSES = ("DEPOSIT_CONFIRMED", "PAID_DELIVERED")
PRODUCT_TYPES = {"CAKE", "DESSERT_TABLE", "EVENT_SETUP"}
SERVICE_TYPES = {"WORKSHOP", "ON_SITE"}
TIME_SLOTS = {"MORNING", "AFTERNOON", "EVENING"}


class BusinessError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def money(value) -> Decimal:
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        raise BusinessError("El valor enviado no es válido.")
    if amount < 0:
        raise BusinessError("El valor no puede ser negativo.")
    return amount


def serialize_customer(customer: Customer) -> dict:
    return {
        "id": customer.id,
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
    }


def serialize_order(order: Order) -> dict:
    return {
        "id": order.id,
        "code": order.code,
        "customer": serialize_customer(order.customer),
        "product_type": order.product_type,
        "service_type": order.service_type,
        "service_date": order.service_date.isoformat(),
        "time_slot": order.time_slot,
        "details": order.details,
        "total_amount": float(order.total_amount),
        "deposit_amount": float(order.deposit_amount),
        "balance_amount": float(order.balance_amount),
        "status": order.status,
        "expires_at": order.expires_at.isoformat(),
        "proof_reference": order.proof_reference,
        "proof_available": bool(order.proof_path),
        "rejection_reason": order.rejection_reason,
        "deposit_confirmed_at": (
            order.deposit_confirmed_at.isoformat() if order.deposit_confirmed_at else None
        ),
        "settled_at": order.settled_at.isoformat() if order.settled_at else None,
        "payment_method": order.payment_method,
        "created_at": order.created_at.isoformat(),
    }


def serialize_catalog_item(item: CatalogItem) -> dict:
    option_image_ids = {
        choice.get("image_id")
        for field in (item.customization_fields or [])
        for choice in field.get("choices", [])
        if choice.get("image_id") is not None
    }
    images_by_id = {image.id: image for image in item.images}
    customization_fields = []
    for field in item.customization_fields or []:
        serialized_field = {**field, "choices": []}
        for choice in field.get("choices", []):
            image = images_by_id.get(choice.get("image_id"))
            serialized_choice = dict(choice)
            if choice.get("image_id") is not None:
                serialized_choice["image_url"] = (
                    f"/api/public/images/{image.id}?v="
                    f"{image.storage_key.rsplit('/', 1)[-1].rsplit('-', 1)[-1].rsplit('.', 1)[0]}"
                    if image and image.is_published else None
                )
            serialized_field["choices"].append(serialized_choice)
        customization_fields.append(serialized_field)
    return {
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "description": item.description,
        "unit_price": float(item.unit_price),
        "active": item.active,
        "customization_fields": customization_fields,
        "images": [
            {
                "id": image.id,
                "original_name": image.original_name,
                "position_x": image.position_x,
                "position_y": image.position_y,
                "zoom": image.zoom,
                "url": (
                    f"/api/public/images/{image.id}?v="
                    f"{image.storage_key.rsplit('/', 1)[-1].rsplit('-', 1)[-1].rsplit('.', 1)[0]}"
                ),
            }
            for image in item.images
            if image.is_published and image.id not in option_image_ids
        ],
    }


def _default_customization_fields(item: CatalogItem) -> list[dict]:
    def choices(values: list[tuple[str, int]]) -> list[dict]:
        return [{"label": label, "surcharge": surcharge} for label, surcharge in values]

    fields = []
    if item.category == "CAKE":
        fields.append({
            "label": "Sabor del bizcocho",
            "type": "select",
            "required": True,
            "allow_other": True,
            "choices": choices([
                ("Chocolate", 0), ("Vainilla", 0), ("Red velvet", 0),
                ("Naranja y amapola", 0), ("Café", 10000), ("Envinada", 10000),
                ("Lemon cake", 0),
            ]),
        })
        if not item.name.lower().startswith("torta individual"):
            fields.append({
                "label": "Relleno",
                "type": "select",
                "required": True,
                "allow_other": True,
                "choices": choices([
                    ("Arequipe", 0), ("Fresas con crema", 10000),
                    ("Fresas con crema de chocolate", 10000), ("Salsa de mora", 0),
                    ("Crema de vainilla o chocolate", 0), ("Crema de maracuyá", 0),
                    ("Lemon pie", 10000), ("Arequipe de café", 0), ("Oreo", 10000),
                ]),
            })
        fields.extend([
            {
                "label": "Cobertura",
                "type": "select",
                "required": True,
                "allow_other": True,
                "choices": choices([("Buttercream", 25000), ("Fondant básico", 50000), ("Fondant modelado", 90000)]),
            },
            {"label": "Decoración", "type": "text", "required": True, "allow_other": True, "choices": []},
            {"label": "Dedicatoria e instrucciones especiales", "type": "textarea", "required": False, "allow_other": False, "choices": []},
        ])
    elif item.category == "SAVORY":
        name = item.name.lower()
        if "sándwich" in name or "sandwich" in name:
            fields.append({
                "label": "Variedad",
                "type": "select",
                "required": True,
                "allow_other": True,
                "choices": choices([("Cerdo", 0), ("Pollo", 0)]),
            })
        fields.append({"label": "Indicaciones especiales", "type": "textarea", "required": False, "allow_other": False, "choices": []})
    elif item.category == "DESSERT":
        fields.append({"label": "Indicaciones especiales", "type": "textarea", "required": False, "allow_other": False, "choices": []})
    elif item.category == "DRINK":
        fields.append({
            "label": "Sabor de bebida",
            "type": "select",
            "required": True,
            "allow_other": True,
            "choices": choices([("Limonada", 0), ("Té", 0), ("Naranjada", 0)]),
        })
    elif item.category == "TABLE":
        fields.extend([
            {"label": "Temática y colores", "type": "text", "required": True, "allow_other": True, "choices": []},
            {"label": "Fecha, lugar y detalles del evento", "type": "textarea", "required": True, "allow_other": False, "choices": []},
        ])
    return fields


def _legacy_seed_customization_fields(item: CatalogItem) -> list[dict]:
    fields = _default_customization_fields(item)

    def option_field(label: str, values: list[str]) -> dict:
        return {
            "label": label,
            "type": "select",
            "required": True,
            "allow_other": True,
            "choices": [{"label": value, "surcharge": 0} for value in values],
        }

    name = item.name.lower()
    if item.category == "DESSERT" and "cupcake" in name:
        fields.insert(0, option_field("Sabor", ["Vainilla", "Chocolate", "Red velvet"]))
    elif item.category == "DESSERT" and "alfajor" in name:
        fields.insert(0, option_field("Relleno", ["Arequipe clásico", "Arequipe de café"]))
    elif item.category == "SAVORY" and "empanada" in name:
        fields.insert(0, option_field("Variedad", ["Carne", "Pollo"]))
    elif item.category == "DRINK":
        drink_field = next(field for field in fields if field["label"] == "Sabor de bebida")
        drink_field["choices"] = [
            {"label": value, "surcharge": 0}
            for value in [
                "Limonada tradicional",
                "Sirope de mora",
                "Limonada de hierbabuena",
                "Naranjada",
            ]
        ]
    return fields


def _normalize_customization_fields(value, catalog_item_id: int | None = None) -> list[dict]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 15:
        raise BusinessError("Las opciones del producto deben ser una lista de hasta 15 campos.")
    normalized = []
    labels_seen = set()
    for field in value:
        if not isinstance(field, dict):
            raise BusinessError("Cada opción del producto debe ser un objeto válido.")
        label = str(field.get("label", "")).strip()
        field_type = str(field.get("type", "select")).strip().lower()
        if not label or len(label) > 80 or field_type not in {"select", "text", "textarea"}:
            raise BusinessError("Revisa el nombre y tipo de cada opción del producto.")
        if label.casefold() in labels_seen:
            raise BusinessError("Cada campo de personalización debe tener un nombre único.")
        labels_seen.add(label.casefold())
        raw_choices = field.get("choices", [])
        if not isinstance(raw_choices, list) or len(raw_choices) > 40:
            raise BusinessError("Cada opción puede incluir hasta 40 alternativas.")
        choices = []
        for choice in raw_choices:
            if not isinstance(choice, dict):
                raise BusinessError("Las alternativas deben tener nombre y recargo válidos.")
            choice_label = str(choice.get("label", "")).strip()
            surcharge = money(choice.get("surcharge", 0))
            if not choice_label or len(choice_label) > 100:
                raise BusinessError("El nombre de cada alternativa es obligatorio y debe ser corto.")
            raw_image_id = choice.get("image_id")
            image_id = None
            if raw_image_id not in (None, ""):
                try:
                    image_id = int(raw_image_id)
                except (TypeError, ValueError):
                    raise BusinessError("La fotografía de una alternativa no es válida.")
                image = db.session.get(ProductImage, image_id)
                if not image:
                    current_app.logger.warning(
                        "Se quitó la referencia a la foto inexistente %s de la opción %s.",
                        image_id,
                        label,
                    )
                    image_id = None
                elif (
                    not catalog_item_id
                    or image.catalog_item_id != catalog_item_id
                    or not image.is_published
                ):
                    raise BusinessError("La fotografía debe estar publicada y asociada a este producto.")
            normalized_choice = {
                "label": choice_label,
                "surcharge": float(surcharge),
            }
            if image_id is not None:
                normalized_choice["image_id"] = image_id
            choices.append(normalized_choice)
        if field_type == "select" and not choices:
            raise BusinessError(f"Agrega alternativas para «{label}» o cambia su tipo a texto.")
        try:
            max_selections = (
                int(field["max_selections"])
                if field_type == "select" and field.get("multiple") and field.get("max_selections") not in (None, "")
                else None
            )
        except (TypeError, ValueError):
            raise BusinessError("El máximo de selecciones debe ser un número entero.")
        if max_selections is not None and max_selections < 1:
            raise BusinessError("El máximo de selecciones debe ser al menos 1.")
        normalized.append({
            "label": label,
            "type": field_type,
            "required": bool(field.get("required", False)),
            "allow_other": field_type == "select" and bool(field.get("allow_other", False)),
            "multiple": field_type == "select" and bool(field.get("multiple", False)),
            "max_selections": max_selections,
            "choices": choices if field_type == "select" else [],
        })
    return normalized


def expire_quotes(now: datetime | None = None) -> int:
    now = now or datetime.utcnow()
    cutoff = now.date() + timedelta(days=3)
    result = db.session.execute(
        select(Order).where(
            Order.status.in_(PENDING_STATUSES),
            ((Order.expires_at <= now) | (Order.service_date < cutoff)),
        )
    )
    orders = result.scalars().all()
    for order in orders:
        order.status = "EXPIRED"
    if orders:
        db.session.commit()
    return len(orders)


def login(email: str, password: str) -> AdminUser:
    user = db.session.execute(
        select(AdminUser).where(func.lower(AdminUser.email) == email.strip().lower())
    ).scalar_one_or_none()
    if not user or not user.is_active or not user.check_password(password):
        raise BusinessError("Correo o contraseña incorrectos.", 401)
    return user


def list_customers() -> list[dict]:
    customers = db.session.execute(
        select(Customer).options(selectinload(Customer.orders)).order_by(Customer.name.asc())
    ).scalars().all()
    return [serialize_customer(customer) for customer in customers]


def save_customer(data: dict) -> Customer:
    name = str(data.get("name", "")).strip()
    phone = str(data.get("phone", "")).strip()
    email = str(data.get("email", "")).strip() or None
    if not name or not phone:
        raise BusinessError("El nombre y teléfono del cliente son obligatorios.")
    customer = db.session.execute(
        select(Customer).where(Customer.phone == phone)
    ).scalar_one_or_none()
    if customer:
        customer.name = name
        customer.email = email
    else:
        customer = Customer(name=name, phone=phone, email=email)
        db.session.add(customer)
    db.session.flush()
    return customer


def list_catalog() -> list[dict]:
    items = db.session.execute(
        select(CatalogItem).order_by(CatalogItem.category, CatalogItem.name)
    ).scalars().all()
    return [serialize_catalog_item(item) for item in items]


def list_public_catalog() -> list[dict]:
    items = db.session.execute(
        select(CatalogItem)
        .where(CatalogItem.active.is_(True))
        .order_by(CatalogItem.category, CatalogItem.id)
    ).scalars().all()
    return [serialize_catalog_item(item) for item in items]


def save_catalog_item(data: dict, item_id: int | None = None) -> CatalogItem:
    name = str(data.get("name", "")).strip()
    category = str(data.get("category", "")).strip().upper()
    if not name or category not in {
        "CAKE", "SAVORY", "DESSERT", "DRINK", "TABLE", "FINISH", "EXTRA", "SETUP"
    }:
        raise BusinessError("Nombre o categoría del producto no válidos.")
    item = db.session.get(CatalogItem, item_id) if item_id else CatalogItem()
    if not item:
        raise BusinessError("El producto no existe.", 404)
    item.name = name
    item.category = category
    item.description = str(data.get("description", "")).strip() or None
    item.unit_price = money(data.get("unit_price"))
    item.active = bool(data.get("active", True))
    if "customization_fields" in data:
        item.customization_fields = _normalize_customization_fields(
            data["customization_fields"], item.id
        )
    elif item.customization_fields is None:
        item.customization_fields = _default_customization_fields(item)
    db.session.add(item)
    db.session.commit()
    return item


def create_quote(data: dict) -> Order:
    product_type = str(data.get("product_type", "")).upper()
    service_type = str(data.get("service_type", "")).upper()
    time_slot = str(data.get("time_slot", "")).upper()
    if product_type not in PRODUCT_TYPES:
        raise BusinessError("Selecciona un tipo de producto válido.")
    if service_type not in SERVICE_TYPES or time_slot not in TIME_SLOTS:
        raise BusinessError("Selecciona un tipo de servicio y horario válidos.")
    try:
        service_date = date.fromisoformat(str(data.get("service_date", "")))
    except ValueError:
        raise BusinessError("La fecha del servicio no es válida.")
    if service_date < date.today() + timedelta(days=3):
        raise BusinessError("La fecha debe tener al menos 3 días de anticipación.")

    customer = save_customer(data.get("customer", {}))
    requested_items = data.get("items")
    if not isinstance(requested_items, list) or not requested_items:
        raise BusinessError("Agrega al menos un producto o adicional a la cotización.")

    lines = []
    total = Decimal("0")
    for requested in requested_items:
        try:
            item_id = int(requested.get("item_id"))
            quantity = int(requested.get("quantity", 1))
        except (TypeError, ValueError, AttributeError):
            raise BusinessError("Los productos de la cotización no son válidos.")
        if quantity < 1 or quantity > 100:
            raise BusinessError("La cantidad debe estar entre 1 y 100.")
        item = db.session.get(CatalogItem, item_id)
        if not item or not item.active:
            raise BusinessError("Uno de los productos ya no está disponible.")
        subtotal = money(item.unit_price * quantity)
        total += subtotal
        lines.append(
            {
                "item_id": item.id,
                "name": item.name,
                "quantity": quantity,
                "unit_price": float(item.unit_price),
                "subtotal": float(subtotal),
            }
        )

    total = money(total)
    if total <= 0:
        raise BusinessError("El total de la cotización debe ser mayor que cero.")
    deposit = money(total * Decimal("0.50"))
    now = datetime.utcnow()
    order = Order(
        code=f"MY-{now:%y%m%d}-{uuid4().hex[:6].upper()}",
        customer=customer,
        product_type=product_type,
        service_type=service_type,
        service_date=service_date,
        time_slot=time_slot,
        details={"items": lines, "notes": str(data.get("notes", "")).strip()},
        total_amount=total,
        deposit_amount=deposit,
        balance_amount=money(total - deposit),
        status="QUOTE_PENDING",
        created_at=now,
        expires_at=now + timedelta(hours=48),
    )
    db.session.add(order)
    db.session.commit()
    return order


def create_store_order(data: dict) -> Order:
    customer_data = data.get("customer")
    if not isinstance(customer_data, dict):
        raise BusinessError("Completa tu nombre y número de contacto.")
    name = str(customer_data.get("name", "")).strip()
    phone = str(customer_data.get("phone", "")).strip()
    digits = "".join(character for character in phone if character.isdigit())
    if not name or len(name) > 120 or len(digits) < 7 or len(digits) > 15:
        raise BusinessError("El nombre o número de contacto no es válido.")

    try:
        service_date = date.fromisoformat(str(data.get("service_date", "")))
    except ValueError:
        raise BusinessError("La fecha del servicio no es válida.")
    if service_date < date.today() + timedelta(days=3):
        raise BusinessError("La fecha debe tener al menos 3 días de anticipación.")

    event_time = str(data.get("event_time", "")).strip()
    try:
        parsed_time = datetime.strptime(event_time, "%H:%M")
    except ValueError:
        raise BusinessError("Selecciona una hora de entrega válida.")
    time_slot = "MORNING" if parsed_time.hour < 12 else "AFTERNOON" if parsed_time.hour < 18 else "EVENING"

    delivery_mode = str(data.get("delivery_mode", "")).strip()
    if delivery_mode not in {"Recoger en el local", "Domicilio", "Servicio en el evento"}:
        raise BusinessError("Selecciona una modalidad de entrega válida.")
    delivery_address = str(data.get("delivery_address", "")).strip()
    if delivery_mode != "Recoger en el local" and not delivery_address:
        raise BusinessError("Indica la dirección de entrega o del evento.")
    if len(delivery_address) > 500:
        raise BusinessError("La dirección no puede superar 500 caracteres.")

    requested_items = data.get("items")
    if not isinstance(requested_items, list) or not requested_items or len(requested_items) > 50:
        raise BusinessError("Agrega entre 1 y 50 productos al pedido.")

    lines = []
    total = Decimal("0")
    has_unpriced_items = False
    categories = set()
    for requested in requested_items:
        try:
            item_id = int(requested.get("item_id"))
            quantity = int(requested.get("quantity", 1))
        except (TypeError, ValueError, AttributeError):
            raise BusinessError("Los productos del pedido no son válidos.")
        if quantity < 1 or quantity > 100:
            raise BusinessError("La cantidad debe estar entre 1 y 100.")
        item = db.session.get(CatalogItem, item_id)
        if not item or not item.active or item.category not in {"CAKE", "SAVORY", "DESSERT", "DRINK", "TABLE"}:
            raise BusinessError("Uno de los productos ya no está disponible.")

        raw_customizations = requested.get("customizations", {})
        if not isinstance(raw_customizations, dict):
            raise BusinessError(f"Las opciones de {item.name} no son válidas.")
        customizations = {}
        surcharge = Decimal("0")
        for field in item.customization_fields or []:
            label = field["label"]
            value = raw_customizations.get(label, "")
            if field["type"] == "select":
                selected = value if isinstance(value, list) else [value] if value else []
                selected = [str(option).strip() for option in selected]
                if field["required"] and not selected:
                    raise BusinessError(f"Elige {label.lower()} para {item.name}.")
                if len(selected) != len(set(selected)) or (
                    not field.get("multiple", False) and len(selected) > 1
                ):
                    raise BusinessError(f"Las selecciones de {label.lower()} para {item.name} no son válidas.")
                maximum = field.get("max_selections")
                if maximum and len(selected) > maximum:
                    raise BusinessError(f"Elige como máximo {maximum} opción(es) para {label.lower()}.")
                choices = {choice["label"]: money(choice.get("surcharge", 0)) for choice in field.get("choices", [])}
                for option in selected:
                    if option == "Otro" and field.get("allow_other"):
                        other = str(raw_customizations.get(f"{label}__otro", "")).strip()
                        if not other or len(other) > 500:
                            raise BusinessError(f"Describe la opción «Otro» de {label.lower()} para {item.name}.")
                        customizations[f"{label}__otro"] = other
                    elif option not in choices:
                        raise BusinessError(f"Una opción de {label.lower()} para {item.name} ya no está disponible.")
                    else:
                        surcharge += choices[option]
                customizations[label] = selected if field.get("multiple", False) else (selected[0] if selected else "")
            else:
                text = str(value).strip()
                if field["required"] and not text:
                    raise BusinessError(f"Completa {label.lower()} para {item.name}.")
                if len(text) > 1000:
                    raise BusinessError(f"{label} no puede superar 1000 caracteres.")
                customizations[label] = text

        for special_key, max_length in (("__solicitudAdicional", 1000), ("__imagenReferencia", 255)):
            extra = str(raw_customizations.get(special_key, "")).strip()
            if len(extra) > max_length:
                raise BusinessError("Las instrucciones adicionales son demasiado largas.")
            if extra:
                customizations[special_key] = extra

        unit_price = money(item.unit_price + surcharge)
        subtotal = money(unit_price * quantity)
        total += subtotal
        has_unpriced_items = has_unpriced_items or item.unit_price <= 0
        categories.add(item.category)
        lines.append({
            "item_id": item.id,
            "name": item.name,
            "category": item.category,
            "quantity": quantity,
            "unit_price": float(unit_price),
            "subtotal": float(subtotal),
            "customizations": customizations,
        })

    notes = str(data.get("notes", "")).strip()
    if len(notes) > 2000:
        raise BusinessError("Las observaciones no pueden superar 2000 caracteres.")
    total = money(total)
    service_type = "ON_SITE" if delivery_mode == "Servicio en el evento" else "WORKSHOP"
    product_type = (
        "EVENT_SETUP" if "TABLE" in categories
        else "CAKE" if categories == {"CAKE"}
        else "DESSERT_TABLE"
    )
    now = datetime.utcnow()
    customer = save_customer({"name": name, "phone": phone})
    order = Order(
        code=f"MY-{now:%y%m%d}-{uuid4().hex[:6].upper()}",
        customer=customer,
        product_type=product_type,
        service_type=service_type,
        service_date=service_date,
        time_slot=time_slot,
        details={
            "origin": "STOREFRONT",
            "delivery_mode": delivery_mode,
            "delivery_address": delivery_address,
            "event_time": event_time,
            "items": lines,
            "notes": notes,
            "requires_manual_quote": has_unpriced_items,
        },
        total_amount=total,
        deposit_amount=Decimal("0"),
        balance_amount=Decimal("0"),
        status="WEB_REQUEST_PENDING",
        created_at=now,
        expires_at=now + timedelta(days=365),
    )
    db.session.add(order)
    db.session.commit()
    return order


def list_orders(status: str | None = None) -> list[dict]:
    expire_quotes()
    query = select(Order).options(selectinload(Order.customer)).order_by(Order.created_at.desc())
    if status:
        query = query.where(Order.status == status.upper())
    return [serialize_order(order) for order in db.session.execute(query).scalars()]


def _lock_capacity_day(service_date: date) -> None:
    capacity = db.session.get(DailyCapacity, service_date)
    if not capacity:
        try:
            with db.session.begin_nested():
                db.session.add(DailyCapacity(service_date=service_date))
                db.session.flush()
        except IntegrityError:
            pass
    db.session.execute(
        select(DailyCapacity)
        .where(DailyCapacity.service_date == service_date)
        .with_for_update()
    ).scalar_one()


def confirm_deposit(order_id: int, admin_id: int) -> Order:
    order = db.session.get(Order, order_id)
    if not order:
        raise BusinessError("El pedido no existe.", 404)
    if order.status != "PAYMENT_REVIEW" or not order.proof_path:
        raise BusinessError("Solo se puede confirmar un anticipo con soporte pendiente.")

    _lock_capacity_day(order.service_date)
    bookings = db.session.execute(
        select(Order).where(
            Order.id != order.id,
            Order.service_date == order.service_date,
            Order.status.in_(CONFIRMED_STATUSES),
        )
    ).scalars().all()
    if any(booking.time_slot == order.time_slot for booking in bookings):
        db.session.rollback()
        raise BusinessError("Ya existe una actividad confirmada en ese horario.", 409)

    same_type = [booking for booking in bookings if booking.service_type == order.service_type]
    is_weekend = order.service_date.weekday() >= 4
    if is_weekend and order.service_type == "ON_SITE" and same_type:
        db.session.rollback()
        raise BusinessError("Ya hay un montaje presencial confirmado para esa fecha.", 409)
    if is_weekend and order.service_type == "WORKSHOP" and len(same_type) >= 2:
        db.session.rollback()
        raise BusinessError("La capacidad de entregas en taller para esa fecha está completa.", 409)

    order.status = "DEPOSIT_CONFIRMED"
    order.deposit_confirmed_at = datetime.utcnow()
    order.rejection_reason = None
    db.session.add(
        Payment(
            order=order,
            payment_type="DEPOSIT",
            amount=order.deposit_amount,
            method="BANK_TRANSFER",
            reference=order.proof_reference,
            confirmed_by=admin_id,
        )
    )
    db.session.commit()
    return order


def reject_proof(order_id: int, reason: str) -> Order:
    order = db.session.get(Order, order_id)
    if not order:
        raise BusinessError("El pedido no existe.", 404)
    if order.status != "PAYMENT_REVIEW":
        raise BusinessError("El pedido no tiene un soporte pendiente de revisión.")
    reason = reason.strip()
    if not reason:
        raise BusinessError("Indica el motivo del rechazo.")
    order.status = "QUOTE_PENDING"
    order.rejection_reason = reason[:255]
    order.proof_path = None
    order.proof_reference = None
    db.session.commit()
    return order


def settle_order(order_id: int, admin_id: int, data: dict) -> Order:
    order = db.session.get(Order, order_id)
    if not order:
        raise BusinessError("El pedido no existe.", 404)
    if order.status != "DEPOSIT_CONFIRMED":
        raise BusinessError("Solo se puede liquidar un pedido con anticipo confirmado.")
    method = str(data.get("payment_method", "")).upper()
    if method not in {"CASH", "BANK_TRANSFER", "CARD"}:
        raise BusinessError("Selecciona un medio de pago válido.")
    order.payment_method = method
    order.settled_at = datetime.utcnow()
    order.status = "PAID_DELIVERED"
    db.session.add(
        Payment(
            order=order,
            payment_type="BALANCE",
            amount=order.balance_amount,
            method=method,
            reference=str(data.get("reference", "")).strip() or None,
            confirmed_by=admin_id,
        )
    )
    db.session.commit()
    return order


def dashboard_summary() -> dict:
    expire_quotes()
    today = date.today()
    total_orders = db.session.scalar(select(func.count(Order.id))) or 0
    pending = db.session.scalar(
        select(func.count(Order.id)).where(Order.status == "PAYMENT_REVIEW")
    ) or 0
    confirmed = db.session.scalar(
        select(func.count(Order.id)).where(Order.status == "DEPOSIT_CONFIRMED")
    ) or 0
    upcoming = db.session.execute(
        select(Order)
        .where(
            Order.service_date >= today,
            Order.status.in_(CONFIRMED_STATUSES),
        )
        .order_by(Order.service_date.asc(), Order.time_slot.asc())
        .limit(6)
    ).scalars().all()
    month_revenue = db.session.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            func.extract("month", Payment.created_at) == today.month,
            func.extract("year", Payment.created_at) == today.year,
        )
    ) or 0
    return {
        "total_orders": total_orders,
        "pending_verification": pending,
        "confirmed_orders": confirmed,
        "month_revenue": float(month_revenue),
        "upcoming": [serialize_order(order) for order in upcoming],
    }


def agenda_month(year: int, month: int) -> dict:
    expire_quotes()
    if month < 1 or month > 12:
        raise BusinessError("El mes solicitado no es válido.")
    bookings = db.session.execute(
        select(Order).where(
            func.extract("year", Order.service_date) == year,
            func.extract("month", Order.service_date) == month,
            Order.status.in_(CONFIRMED_STATUSES),
        ).order_by(Order.service_date, Order.time_slot)
    ).scalars().all()
    days: dict[str, list[dict]] = {}
    for order in bookings:
        key = order.service_date.isoformat()
        days.setdefault(key, []).append(serialize_order(order))
    return {
        day: {
            "status": (
                "RED"
                if sum(item["service_type"] == "ON_SITE" for item in items) >= 1
                and sum(item["service_type"] == "WORKSHOP" for item in items) >= 2
                else "RED"
                if sum(item["service_type"] == "WORKSHOP" for item in items) >= 2
                else "YELLOW"
            ),
            "orders": items,
        }
        for day, items in days.items()
    }


def seed_data() -> None:
    email = os.getenv("ADMIN_EMAIL", "admin@mayic.com").strip().lower()
    admin = db.session.execute(
        select(AdminUser).where(func.lower(AdminUser.email) == email)
    ).scalar_one_or_none()
    if not admin:
        password = os.getenv("ADMIN_PASSWORD", "")
        if not password.strip():
            raise RuntimeError(
                "ADMIN_PASSWORD debe estar definida para crear la cuenta administradora."
            )
        admin = AdminUser(name="Administradora Mayic", email=email)
        admin.set_password(password)
        db.session.add(admin)

    defaults = [
        ("Torta individual", "CAKE", "4 a 8 porciones · Personalizable", 25000),
        ("Torta media libra", "CAKE", "10 a 15 porciones", 45000),
        ("Torta de libra", "CAKE", "18 a 25 porciones", 65000),
        ("Torta libra alta", "CAKE", "30 a 40 porciones", 80000),
        ("Torta libra alta y ancha", "CAKE", "40 a 50 porciones", 100000),
        ("Torta personalizada por porción", "CAKE", "Porción estándar", 10000),
        ("Mini sándwich de cerdo o pollo", "SAVORY", "Unidad · Recién preparado", 4000),
        ("Mini perros", "SAVORY", "Unidad", 3800),
        ("Bolitas de carne", "SAVORY", "Porción", 25000),
        ("Hamburguesitas", "SAVORY", "Unidad", 4000),
        ("Medallones de chorizo", "SAVORY", "Porción", 30000),
        ("Bocados de chorizo", "SAVORY", "Porción", 36000),
        ("Tostadas típicas", "SAVORY", "Unidad", 3500),
        ("Hawaianos", "SAVORY", "Unidad", 3500),
        ("Carrozas de plátano", "SAVORY", "Unidad", 3500),
        ("Empanadas clásicas", "SAVORY", "Unidad", 2500),
        ("Mini cupcakes", "DESSERT", "Unidad", 2000),
        ("Cupcakes clásicos", "DESSERT", "Por encargo", 3500),
        ("Cheesecake en vaso", "DESSERT", "Unidad", 6500),
        ("Postre en vaso", "DESSERT", "Unidad", 5000),
        ("Bocados de tartaleta", "DESSERT", "Unidad", 3000),
        ("Alfajores", "DESSERT", "Unidad", 2500),
        ("Pinchos dulzones", "DESSERT", "Unidad", 3500),
        ("Gelatina playera", "DESSERT", "Unidad", 3000),
        ("Mesa de postres por docena", "DESSERT", "Docena de postres variados", 45000),
        ("Dispensador de 8 litros + 50 vasos", "DRINK", "Limonada, té o naranjada", 50000),
        ("Montaje básico", "TABLE", "Decoración base blanca y floral", 0),
        ("Montaje clásico", "TABLE", "Variedad de bases, mantelería y caminos", 40000),
        ("Montaje premium", "TABLE", "Diseño personalizado y montaje completo", 80000),
        ("Buttercream", "FINISH", "Acabado buttercream", 25000),
        ("Fondant básico", "FINISH", "Acabado fondant básico", 50000),
        ("Fondant modelado", "FINISH", "Acabado fondant modelado", 90000),
        ("Modelado 3D en azúcar", "EXTRA", "Figura personalizada", 35000),
        ("Estructura de soporte", "EXTRA", "Soporte interno", 20000),
        ("Flores naturales", "EXTRA", "Arreglo floral", 30000),
        ("Flete de transporte", "SETUP", "Transporte y montaje", 40000),
    ]
    for name, category, description, price in defaults:
        exists = db.session.execute(
            select(CatalogItem.id).where(CatalogItem.name == name)
        ).first()
        if not exists:
            item = CatalogItem(
                name=name,
                category=category,
                description=description,
                unit_price=Decimal(price),
            )
            item.customization_fields = _default_customization_fields(item)
            db.session.add(item)
        else:
            item = db.session.execute(
                select(CatalogItem).where(CatalogItem.name == name)
            ).scalar_one()
            if item.customization_fields is None:
                item.customization_fields = _default_customization_fields(item)
            elif item.customization_fields == _legacy_seed_customization_fields(item):
                item.customization_fields = _default_customization_fields(item)
    db.session.commit()


def expire_quotes_worker(interval_seconds: int) -> None:
    if interval_seconds < 1:
        raise ValueError("El intervalo del proceso de vencimientos debe ser positivo.")
    app = current_app._get_current_object()
    while True:
        with app.app_context():
            try:
                expired_count = expire_quotes()
                if expired_count:
                    app.logger.info("Se vencieron %s cotizaciones.", expired_count)
            except Exception:
                app.logger.exception("No se pudieron evaluar las cotizaciones vencidas.")
                db.session.rollback()
        time.sleep(interval_seconds)
