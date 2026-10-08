"""Add marketplace

Revision ID: 4f4e8e666642
Revises: 0002_agent_recycler
Create Date: 2026-10-09 12:05:15.617875

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = '4f4e8e666642'
down_revision: str | None = '0002_agent_recycler'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
