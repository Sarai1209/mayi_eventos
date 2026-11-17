import io
from datetime import date, timedelta
from decimal import Decimal

import pytest
from flask_jwt_extended import create_access_token

from api import create_app
from api.controllers import mayic_controller as service
from api.extensions import db
from api.models import AdminUser, CatalogItem, Order, ProductImage


@pytest.fixture
def mayic_client(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD", "test-admin-password")
    app = create_app(
        {
            "TESTING": True,
            "JWT_SECRET_KEY": "test-key-for-mayic-tests-with-32-bytes",
            "SQLALCHEMY_DATABASE_URI": "sqlite://",
            "UPLOAD_FOLDER": str(tmp_path),
            "IMAGE_UPLOAD_FOLDER": str(tmp_path / "product_images"),
        }
    )
    with app.app_context():
        db.create_all()
        service.seed_data()
        client = app.test_client()
        yield client
        db.session.remove()
        db.drop_all()


def quote_data(service_date: date, time_slot: str = "MORNING") -> dict:
    cake = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Torta personalizada por porción")
    ).scalar_one()
    return {
        "customer": {"name": "Ana Cliente", "phone": f"300{service_date:%d%m}{time_slot}"},
        "product_type": "CAKE",
        "service_type": "WORKSHOP",
        "service_date": service_date.isoformat(),
        "time_slot": time_slot,
        "items": [{"item_id": cake.id, "quantity": 10}],
    }


def test_quote_uses_catalog_prices_and_fixed_fifty_percent_advance(mayic_client):
    quote_date = date.today() + timedelta(days=4)
    order = service.create_quote(quote_data(quote_date))

    assert order.total_amount == Decimal("100000.00")
    assert order.deposit_amount == Decimal("50000.00")
    assert order.balance_amount == Decimal("50000.00")
    assert order.status == "QUOTE_PENDING"
    assert order.expires_at - order.created_at == timedelta(hours=48)


def test_quote_rejects_prices_from_client_and_unknown_catalog_items(mayic_client):
    data = quote_data(date.today() + timedelta(days=4))
    data["total_amount"] = 1
    data["deposit_amount"] = 0
    data["items"] = [{"item_id": 9999, "quantity": 1}]

    with pytest.raises(service.BusinessError, match="productos ya no está disponible"):
        service.create_quote(data)


def test_storefront_order_is_saved_for_admin_with_server_calculated_customizations(mayic_client):
    cake = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Torta personalizada por porción")
    ).scalar_one()
    request_data = {
        "customer": {"name": "Ana Cliente", "phone": "3001234567"},
        "service_date": (date.today() + timedelta(days=4)).isoformat(),
        "event_time": "15:30",
        "delivery_mode": "Domicilio",
        "delivery_address": "Calle 10 # 20-30",
        "notes": "Llamar al llegar",
        "total_amount": 1,
        "items": [{
            "item_id": cake.id,
            "quantity": 1,
            "unit_price": 1,
            "customizations": {
                "Sabor del bizcocho": "Chocolate",
                "Relleno": "Arequipe",
                "Cobertura": "Buttercream",
                "Decoración": "Flores lilas",
                "__imagenReferencia": "referencia.jpg",
            },
        }],
    }

    response = mayic_client.post("/api/public/orders", json=request_data)

    assert response.status_code == 201
    order = response.get_json()
    assert order["status"] == "WEB_REQUEST_PENDING"
    assert order["total_amount"] == 35000
    assert order["deposit_amount"] == 0
    assert order["details"]["origin"] == "STOREFRONT"
    assert order["details"]["event_time"] == "15:30"
    assert order["details"]["delivery_address"] == "Calle 10 # 20-30"
    assert order["details"]["items"][0]["customizations"]["Decoración"] == "Flores lilas"
    assert order["details"]["items"][0]["customizations"]["__imagenReferencia"] == "referencia.jpg"
    assert mayic_client.get("/api/orders").status_code == 401

    token = create_access_token(identity="1")
    admin_orders = mayic_client.get(
        "/api/orders", headers={"Authorization": f"Bearer {token}"}
    ).get_json()
    assert [saved["code"] for saved in admin_orders] == [order["code"]]


def test_storefront_order_rejects_missing_required_or_unknown_customizations(mayic_client):
    cake = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Torta personalizada por porción")
    ).scalar_one()
    request_data = {
        "customer": {"name": "Ana Cliente", "phone": "3001234567"},
        "service_date": (date.today() + timedelta(days=4)).isoformat(),
        "event_time": "15:30",
        "delivery_mode": "Recoger en el local",
        "items": [{
            "item_id": cake.id,
            "quantity": 1,
            "customizations": {
                "Sabor del bizcocho": "Sabor inventado",
                "Relleno": "Arequipe",
                "Cobertura": "Buttercream",
                "Decoración": "Flores",
            },
        }],
    }

    response = mayic_client.post("/api/public/orders", json=request_data)

    assert response.status_code == 400
    assert "ya no está disponible" in response.get_json()["message"]
    assert mayic_client.get("/api/orders").status_code == 401


def test_quote_expires_after_forty_eight_hours_and_releases_status(mayic_client):
    order = service.create_quote(quote_data(date.today() + timedelta(days=4)))
    count = service.expire_quotes(order.expires_at)

    assert count == 1
    assert db.session.get(Order, order.id).status == "EXPIRED"


def test_deposit_cannot_be_confirmed_without_a_reviewed_proof(mayic_client):
    order = service.create_quote(quote_data(date.today() + timedelta(days=4)))

    with pytest.raises(service.BusinessError, match="soporte pendiente"):
        service.confirm_deposit(order.id, 1)


def test_weekend_capacity_limits_third_workshop_order(mayic_client):
    saturday = date.today() + timedelta(days=(5 - date.today().weekday()) % 7 or 7)
    if saturday < date.today() + timedelta(days=3):
        saturday += timedelta(days=7)
    slots = ["MORNING", "AFTERNOON", "EVENING"]
    admin = db.session.execute(db.select(AdminUser)).scalar_one()
    orders = []
    for slot in slots:
        order = service.create_quote(quote_data(saturday, slot))
        order.status = "PAYMENT_REVIEW"
        order.proof_path = "proof.pdf"
        orders.append(order)
    db.session.commit()

    service.confirm_deposit(orders[0].id, admin.id)
    service.confirm_deposit(orders[1].id, admin.id)

    with pytest.raises(service.BusinessError, match="capacidad de entregas"):
        service.confirm_deposit(orders[2].id, admin.id)


def test_catalog_prices_are_editable_and_reused_by_quotes(mayic_client):
    cake = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Torta personalizada por porción")
    ).scalar_one()
    cake.unit_price = Decimal("12500")
    db.session.commit()

    order = service.create_quote(quote_data(date.today() + timedelta(days=4)))

    assert order.total_amount == Decimal("125000.00")
    assert order.deposit_amount == Decimal("62500.00")


def test_public_catalog_needs_no_auth_and_hides_inactive_products(mayic_client):
    inactive_item = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Torta individual")
    ).scalar_one()
    inactive_item.active = False
    db.session.commit()

    response = mayic_client.get("/api/public/catalog")

    assert response.status_code == 200
    products = response.get_json()
    assert products
    assert all(product["active"] for product in products)
    assert all(product["id"] != inactive_item.id for product in products)


def test_product_images_are_admin_managed_private_until_published_and_persistent(mayic_client):
    with mayic_client.application.app_context():
        cake = db.session.execute(
            db.select(CatalogItem).where(CatalogItem.name == "Torta de libra")
        ).scalar_one()
        token = create_access_token(identity="1")
        cake_id = cake.id
    headers = {"Authorization": f"Bearer {token}"}
    first_png = b"\x89PNG\r\n\x1a\noriginal MayC photo"
    second_png = b"\x89PNG\r\n\x1a\nsecond view"

    upload_response = mayic_client.post(
        "/api/images",
        headers=headers,
        data={
            "category": "CAKE",
            "catalog_item_id": str(cake_id),
            "images": [
                (io.BytesIO(first_png), "torta-frontal.png"),
                (io.BytesIO(second_png), "torta-lateral.png"),
            ],
        },
        content_type="multipart/form-data",
    )

    assert upload_response.status_code == 201
    uploaded = upload_response.get_json()
    assert len(uploaded) == 2
    image_id = uploaded[0]["id"]
    assert uploaded[0]["is_published"] is False
    assert mayic_client.get("/api/images").status_code == 401
    assert mayic_client.get(f"/api/images/{image_id}/file").status_code == 401
    assert mayic_client.get(f"/api/public/images/{image_id}").status_code == 404
    assert next(
        item for item in mayic_client.get("/api/public/catalog").get_json()
        if item["id"] == cake_id
    )["images"] == []

    private_preview = mayic_client.get(
        f"/api/images/{image_id}/file", headers=headers
    )
    assert private_preview.status_code == 200
    assert private_preview.data == first_png
    private_preview.close()

    publish_response = mayic_client.patch(
        f"/api/images/{image_id}",
        headers=headers,
        json={"is_published": True},
    )
    assert publish_response.status_code == 200
    public_cake = next(
        item for item in mayic_client.get("/api/public/catalog").get_json()
        if item["id"] == cake_id
    )
    assert len(public_cake["images"]) == 1
    old_public_url = public_cake["images"][0]["url"]
    framing_response = mayic_client.patch(
        f"/api/images/{image_id}",
        headers=headers,
        json={"position_x": 25, "position_y": 70, "zoom": 135},
    )
    assert framing_response.status_code == 200
    assert {
        "position_x": framing_response.get_json()["position_x"],
        "position_y": framing_response.get_json()["position_y"],
        "zoom": framing_response.get_json()["zoom"],
    } == {"position_x": 25, "position_y": 70, "zoom": 135}
    framed_cake = next(
        item for item in mayic_client.get("/api/public/catalog").get_json()
        if item["id"] == cake_id
    )
    assert framed_cake["images"][0]["position_x"] == 25
    assert framed_cake["images"][0]["position_y"] == 70
    assert framed_cake["images"][0]["zoom"] == 135
    published_response = mayic_client.get(f"/api/public/images/{image_id}")
    assert published_response.data == first_png
    published_response.close()

    replace_response = mayic_client.put(
        f"/api/images/{image_id}/file",
        headers=headers,
        data={"image": (io.BytesIO(second_png), "torta-actualizada.png")},
        content_type="multipart/form-data",
    )
    assert replace_response.status_code == 200
    assert replace_response.get_json()["is_published"] is True
    replaced_cake = next(
        item for item in mayic_client.get("/api/public/catalog").get_json()
        if item["id"] == cake_id
    )
    assert replaced_cake["images"][0]["url"] != old_public_url
    replaced_response = mayic_client.get(f"/api/public/images/{image_id}")
    assert replaced_response.data == second_png
    replaced_response.close()

    delete_response = mayic_client.delete(
        f"/api/images/{image_id}", headers=headers
    )
    assert delete_response.status_code == 200
    assert mayic_client.get(f"/api/public/images/{image_id}").status_code == 404
    with mayic_client.application.app_context():
        assert db.session.get(ProductImage, image_id) is None


def test_image_upload_checks_category_product_and_actual_file_type(mayic_client):
    with mayic_client.application.app_context():
        cake = db.session.execute(
            db.select(CatalogItem).where(CatalogItem.name == "Torta de libra")
        ).scalar_one()
        token = create_access_token(identity="1")
        cake_id = cake.id
    headers = {"Authorization": f"Bearer {token}"}

    invalid_assignment = mayic_client.post(
        "/api/images",
        headers=headers,
        data={
            "category": "DRINK",
            "catalog_item_id": str(cake_id),
            "images": (io.BytesIO(b"\x89PNG\r\n\x1a\nphoto"), "wrong.png"),
        },
        content_type="multipart/form-data",
    )
    invalid_image = mayic_client.post(
        "/api/images",
        headers=headers,
        data={
            "category": "CAKE",
            "catalog_item_id": str(cake_id),
            "images": (io.BytesIO(b"not an image"), "fake.png"),
        },
        content_type="multipart/form-data",
    )

    assert invalid_assignment.status_code == 400
    assert invalid_image.status_code == 400


def test_image_framing_rejects_out_of_range_settings(mayic_client):
    with mayic_client.application.app_context():
        token = create_access_token(identity="1")
    response = mayic_client.post(
        "/api/images",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "category": "FEATURED",
            "images": (io.BytesIO(b"\x89PNG\r\n\x1a\nphoto"), "banner.png"),
        },
        content_type="multipart/form-data",
    )
    image_id = response.get_json()[0]["id"]

    invalid = mayic_client.patch(
        f"/api/images/{image_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"position_x": 101},
    )

    assert invalid.status_code == 400


def test_catalog_customization_options_are_public_and_editable(mayic_client):
    cake = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Torta de libra")
    ).scalar_one()
    options = cake.customization_fields
    flavor_field = next(field for field in options if field["label"] == "Sabor del bizcocho")

    assert flavor_field["required"] is True
    assert any(choice["label"] == "Vainilla" for choice in flavor_field["choices"])

    response = mayic_client.get("/api/public/catalog")
    public_cake = next(item for item in response.get_json() if item["id"] == cake.id)
    assert public_cake["customization_fields"] == options

    updated = service.save_catalog_item(
        {
            "name": cake.name,
            "category": cake.category,
            "description": cake.description,
            "unit_price": float(cake.unit_price),
            "active": True,
            "customization_fields": [
                {
                    "label": "Sabor",
                    "type": "select",
                    "required": True,
                    "allow_other": True,
                    "choices": [{"label": "Vainilla", "surcharge": 0}],
                }
            ],
        },
        cake.id,
    )
    assert updated.customization_fields[0]["label"] == "Sabor"


def test_catalog_choice_images_publish_with_options_and_stay_out_of_product_gallery(mayic_client):
    with mayic_client.application.app_context():
        cake = db.session.execute(
            db.select(CatalogItem).where(CatalogItem.name == "Torta de libra")
        ).scalar_one()
        other_cake = db.session.execute(
            db.select(CatalogItem).where(CatalogItem.name == "Torta media libra")
        ).scalar_one()
        cake_id = cake.id
        other_cake_id = other_cake.id
        token = create_access_token(identity="1")
    headers = {"Authorization": f"Bearer {token}"}
    photo_bytes = b"\x89PNG\r\n\x1a\nfoto del sabor chocolate"
    upload_response = mayic_client.post(
        "/api/images",
        headers=headers,
        data={
            "category": "CAKE",
            "catalog_item_id": str(cake_id),
            "images": (io.BytesIO(photo_bytes), "sabor-chocolate.png"),
        },
        content_type="multipart/form-data",
    )
    assert upload_response.status_code == 201
    image_id = upload_response.get_json()[0]["id"]
    publish_response = mayic_client.patch(
        f"/api/images/{image_id}", headers=headers, json={"is_published": True}
    )
    assert publish_response.status_code == 200

    fields = [{
        "label": "Sabor",
        "type": "select",
        "required": True,
        "choices": [
            {"label": "Chocolate", "surcharge": 0, "image_id": image_id},
            {"label": "Vainilla", "surcharge": 0, "image_id": 999999},
        ],
    }]
    with mayic_client.application.app_context():
        cake = db.session.get(CatalogItem, cake_id)
        service.save_catalog_item({
            "name": cake.name,
            "category": cake.category,
            "unit_price": float(cake.unit_price),
            "active": True,
            "customization_fields": fields,
        }, cake_id)

    public_cake = next(
        item for item in mayic_client.get("/api/public/catalog").get_json()
        if item["id"] == cake_id
    )
    choice = public_cake["customization_fields"][0]["choices"][0]
    assert choice["image_url"].startswith(f"/api/public/images/{image_id}?v=")
    assert public_cake["images"] == []
    assert "image_id" not in public_cake["customization_fields"][0]["choices"][1]
    image_response = mayic_client.get(f"/api/public/images/{image_id}")
    assert image_response.status_code == 200
    assert image_response.data == photo_bytes
    image_response.close()

    with mayic_client.application.app_context():
        other_cake = db.session.get(CatalogItem, other_cake_id)
        with pytest.raises(service.BusinessError, match="asociada a este producto"):
            service.save_catalog_item({
                "name": other_cake.name,
                "category": other_cake.category,
                "unit_price": float(other_cake.unit_price),
                "active": True,
                "customization_fields": fields,
            }, other_cake_id)


def test_catalog_customization_options_reject_duplicate_field_names(mayic_client):
    cake = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Torta de libra")
    ).scalar_one()

    with pytest.raises(service.BusinessError, match="nombre único"):
        service.save_catalog_item(
            {
                "name": cake.name,
                "category": cake.category,
                "description": cake.description,
                "unit_price": float(cake.unit_price),
                "active": True,
                "customization_fields": [
                    {"label": "Sabor", "type": "text"},
                    {"label": " sabor ", "type": "text"},
                ],
            },
            cake.id,
        )


def test_catalog_supports_multiple_choices_with_a_configured_limit(mayic_client):
    normalized = service._normalize_customization_fields(
        [
            {
                "label": "Sabores",
                "type": "select",
                "required": True,
                "allow_other": True,
                "multiple": True,
                "max_selections": 2,
                "choices": [
                    {"label": "Chocolate", "surcharge": 0},
                    {"label": "Vainilla", "surcharge": 5000},
                ],
            }
        ]
    )

    assert normalized[0]["multiple"] is True
    assert normalized[0]["max_selections"] == 2
    assert normalized[0]["choices"][1]["surcharge"] == 5000

    with pytest.raises(service.BusinessError, match="número entero"):
        service._normalize_customization_fields(
            [
                {
                    "label": "Sabores",
                    "type": "select",
                    "multiple": True,
                    "max_selections": "muchos",
                    "choices": [{"label": "Chocolate", "surcharge": 0}],
                }
            ]
        )


def test_default_product_options_do_not_guess_unlisted_flavors(mayic_client):
    empanadas = CatalogItem(
        name="Empanadas clásicas",
        category="SAVORY",
        unit_price=Decimal("2500"),
    )
    cupcakes = CatalogItem(
        name="Mini cupcakes",
        category="DESSERT",
        unit_price=Decimal("2000"),
    )
    sandwich = CatalogItem(
        name="Mini sándwich de cerdo o pollo",
        category="SAVORY",
        unit_price=Decimal("4000"),
    )

    assert all(not field["choices"] for field in service._default_customization_fields(empanadas))
    assert all(not field["choices"] for field in service._default_customization_fields(cupcakes))
    sandwich_varieties = next(
        field for field in service._default_customization_fields(sandwich)
        if field["label"] == "Variedad"
    )
    assert [choice["label"] for choice in sandwich_varieties["choices"]] == ["Cerdo", "Pollo"]


def test_seed_replaces_only_unchanged_generated_options(mayic_client):
    cupcake = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Mini cupcakes")
    ).scalar_one()
    empanadas = db.session.execute(
        db.select(CatalogItem).where(CatalogItem.name == "Empanadas clásicas")
    ).scalar_one()
    cupcake.customization_fields = service._legacy_seed_customization_fields(cupcake)
    empanadas.customization_fields = [
        {"label": "Sabor de la casa", "type": "text", "required": True, "allow_other": False, "choices": []}
    ]
    db.session.commit()

    service.seed_data()

    assert all(not field["choices"] for field in db.session.get(CatalogItem, cupcake.id).customization_fields)
    assert db.session.get(CatalogItem, empanadas.id).customization_fields[0]["label"] == "Sabor de la casa"


def test_seed_requires_admin_password_when_creating_account(mayic_client, monkeypatch):
    admin = db.session.execute(db.select(AdminUser)).scalar_one()
    db.session.delete(admin)
    db.session.commit()
    monkeypatch.delenv("ADMIN_PASSWORD")

    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD debe estar definida"):
        service.seed_data()

    assert db.session.execute(db.select(AdminUser)).scalar_one_or_none() is None


def test_login_issues_token_and_dashboard_requires_authentication(mayic_client):
    unauthorized = mayic_client.get("/api/dashboard")
    login_response = mayic_client.post(
        "/api/auth/login",
        json={"email": "admin@mayic.com", "password": "test-admin-password"},
    )

    assert unauthorized.status_code == 401
    assert login_response.status_code == 200
    token = login_response.get_json()["access_token"]
    response = mayic_client.get(
        "/api/dashboard", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.get_json()["total_orders"] == 0


def test_payment_proof_review_and_settlement_lifecycle(mayic_client):
    order = service.create_quote(quote_data(date.today() + timedelta(days=4)))
    login_response = mayic_client.post(
        "/api/auth/login",
        json={"email": "admin@mayic.com", "password": "test-admin-password"},
    )
    headers = {
        "Authorization": f"Bearer {login_response.get_json()['access_token']}"
    }

    upload_response = mayic_client.post(
        f"/api/orders/{order.id}/proof",
        headers=headers,
        data={
            "reference": "BANK-123",
            "proof": (io.BytesIO(b"%PDF-1.4 test proof"), "proof.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert upload_response.status_code == 200
    assert upload_response.get_json()["status"] == "PAYMENT_REVIEW"

    confirm_response = mayic_client.post(
        f"/api/orders/{order.id}/confirm-deposit", headers=headers
    )
    assert confirm_response.status_code == 200
    assert confirm_response.get_json()["status"] == "DEPOSIT_CONFIRMED"

    settle_response = mayic_client.post(
        f"/api/orders/{order.id}/settle",
        headers=headers,
        json={"payment_method": "BANK_TRANSFER", "reference": "BANK-456"},
    )
    assert settle_response.status_code == 200
    assert settle_response.get_json()["status"] == "PAID_DELIVERED"
