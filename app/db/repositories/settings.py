"""Persistence for app settings key-value store."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import AppSettingRow


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SettingsRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_all(self) -> dict[str, str]:
        rows = self.session.query(AppSettingRow).all()
        return {row.key: row.value for row in rows}

    def get(self, key: str) -> str | None:
        row = self.session.get(AppSettingRow, key)
        return None if row is None else row.value

    def set_many(self, updates: dict[str, str]) -> None:
        now = _now()
        for key, value in updates.items():
            row = self.session.get(AppSettingRow, key)
            if row is None:
                self.session.add(
                    AppSettingRow(key=key, value=value, updated_at=now)
                )
            else:
                row.value = value
                row.updated_at = now
        self.session.flush()

    def delete(self, key: str) -> bool:
        row = self.session.get(AppSettingRow, key)
        if row is None:
            return False
        self.session.delete(row)
        self.session.flush()
        return True
