"""Initial schema - mirrors api.db.models (Alembic-managed going forward)."""
revision = "0001_init"
down_revision = None


def upgrade() -> None:
    from api.db.models import Base

    # create_all is executed by env.py; revision tracks application order.
    _ = Base.metadata


def downgrade() -> None:
    pass
