from app import db


class FavoriteFolder(db.Model):
    __tablename__ = "favorite_folders"

    id = db.Column(db.Integer, primary_key=True)
    path = db.Column(db.Text, nullable=False, unique=True)
    name = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
