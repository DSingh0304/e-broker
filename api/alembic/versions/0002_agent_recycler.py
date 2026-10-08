"""Add AgentResult table; improve Recycler schema."""
import sqlalchemy as sa
from alembic import op

revision = "0002_agent_recycler"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recyclers", sa.Column("email", sa.Text, nullable=True))
    op.add_column("recyclers", sa.Column("website", sa.Text, nullable=True))
    op.add_column("recyclers", sa.Column(
        "cpcb_valid_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recyclers", sa.Column(
        "min_quantity_kg", sa.Float, nullable=False, server_default="0"))
    op.add_column("recyclers", sa.Column("processing_types", sa.JSON, nullable=True))
    op.add_column("recyclers", sa.Column(
        "verified", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("recyclers", sa.Column(
        "updated_at", sa.DateTime(timezone=True),
        nullable=False, server_default=sa.func.now()))

    op.create_table(
        "agent_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("image_id", sa.String(36),
                  sa.ForeignKey("images.id", ondelete="CASCADE"),
                  nullable=False, index=True, unique=True),
        sa.Column("result", sa.JSON, nullable=True),
        sa.Column("status", sa.String(16),
                  nullable=False, server_default="pending"),
        sa.Column("error_detail", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("agent_results")
    for col in ["email", "website", "cpcb_valid_until", "min_quantity_kg",
                "processing_types", "verified", "updated_at"]:
        op.drop_column("recyclers", col)
