from datetime import datetime
from decimal import Decimal

from werkzeug.security import check_password_hash, generate_password_hash

from api.extensions import db


class AdminUser(db.Model):
    __tablename__ = "admin_users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)


class Customer(db.Model):
    __tablename__ = "customers"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(32), nullable=False, unique=True, index=True)
    email = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class CatalogItem(db.Model):
    __tablename__ = "catalog_items"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(32), nullable=False, index=True)
    description = db.Column(db.String(255))
    unit_price = db.Column(db.Numeric(12, 2), nullable=False, default=Decimal("0"))
    active = db.Column(db.Boolean, nullable=False, default=True)
    customization_fields = db.Column(db.JSON, nullable=True, default=list)
    images = db.relationship(
        "ProductImage",
        backref="catalog_item",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ProductImage.id",
    )


class ProductImage(db.Model):
    __tablename__ = "product_images"

    id = db.Column(db.Integer, primary_key=True)
    catalog_item_id = db.Column(
        db.Integer, db.ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=True, index=True
    )
    category = db.Column(db.String(16), nullable=False, index=True)
    storage_key = db.Column(db.String(255), nullable=False, unique=True)
    original_name = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(32), nullable=False)
    position_x = db.Column(db.Integer, nullable=False, default=50)
    position_y = db.Column(db.Integer, nullable=False, default=50)
    zoom = db.Column(db.Integer, nullable=False, default=100)
    is_published = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(24), nullable=False, unique=True, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    product_type = db.Column(db.String(32), nullable=False)
    service_type = db.Column(db.String(24), nullable=False)
    service_date = db.Column(db.Date, nullable=False, index=True)
    time_slot = db.Column(db.String(32), nullable=False)
    details = db.Column(db.JSON, nullable=False, default=dict)
    total_amount = db.Column(db.Numeric(12, 2), nullable=False)
    deposit_amount = db.Column(db.Numeric(12, 2), nullable=False)
    balance_amount = db.Column(db.Numeric(12, 2), nullable=False)
    status = db.Column(db.String(32), nullable=False, default="QUOTE_PENDING", index=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    proof_path = db.Column(db.String(255))
    proof_reference = db.Column(db.String(120))
    rejection_reason = db.Column(db.String(255))
    deposit_confirmed_at = db.Column(db.DateTime)
    settled_at = db.Column(db.DateTime)
    payment_method = db.Column(db.String(32))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    customer = db.relationship("Customer", backref=db.backref("orders", lazy=True))
    payments = db.relationship(
        "Payment", backref="order", cascade="all, delete-orphan", lazy=True
    )


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    payment_type = db.Column(db.String(16), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    method = db.Column(db.String(32), nullable=False)
    reference = db.Column(db.String(120))
    confirmed_by = db.Column(db.Integer, db.ForeignKey("admin_users.id"), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class DailyCapacity(db.Model):
    __tablename__ = "daily_capacity"

    service_date = db.Column(db.Date, primary_key=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
