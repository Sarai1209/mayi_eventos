import os
from pathlib import Path

from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager

from api.extensions import db, migrate


def create_app(test_config: dict | None = None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 60 * 1024 * 1024
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRES", "3600")
    )
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL",
        "mysql+mysqlconnector://mayic:mayic_pass@db:3306/mayic",
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["UPLOAD_FOLDER"] = os.getenv(
        "UPLOAD_FOLDER", str(Path(app.instance_path) / "payment_proofs")
    )
    app.config["IMAGE_UPLOAD_FOLDER"] = os.getenv(
        "IMAGE_UPLOAD_FOLDER", str(Path(app.instance_path) / "product_images")
    )
    if test_config:
        app.config.update(test_config)
    if not app.config["JWT_SECRET_KEY"]:
        raise RuntimeError("JWT_SECRET_KEY no está definida en las variables de entorno.")

    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    Path(app.config["IMAGE_UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    db.init_app(app)
    migrate.init_app(app, db)
    JWTManager(app)
    CORS(app, origins=os.getenv("ALLOWED_ORIGINS", "*").split(","))

    from api.models import AdminUser, CatalogItem, Customer, DailyCapacity, Order, Payment, ProductImage
    from api.routes.mayic_routes import bp
    from api.controllers.mayic_controller import seed_data

    app.register_blueprint(bp, url_prefix="/api")

    @app.cli.command("seed")
    def seed_command():
        seed_data()
        print("Datos iniciales de Mayic listos.")

    @app.cli.command("expire-quotes")
    def expire_quotes_command():
        from api.controllers.mayic_controller import expire_quotes_worker

        expire_quotes_worker(int(os.getenv("QUOTE_EXPIRY_POLL_SECONDS", "30")))

    @app.get("/")
    def root():
        return {"service": "Mayic API", "status": "ok"}

    return app
