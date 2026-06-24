from app import db


class ImportedDirectory(db.Model):
    __tablename__ = "imported_directories"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(
        db.Integer, db.ForeignKey("import_sessions.id"), nullable=False
    )
    path = db.Column(db.Text, nullable=False, default="")
    name = db.Column(db.Text, nullable=False, default="")
    parent_path = db.Column(db.Text, nullable=True)

    __table_args__ = (db.UniqueConstraint("session_id", "path"),)

    def to_dict(self):
        return {
            "id": self.id,
            "path": self.path,
            "name": self.name or "(root)",
        }
