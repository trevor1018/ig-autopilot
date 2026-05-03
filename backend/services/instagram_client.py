"""Instagram client wrapper — abstracts instagrapi behind an interface so we can:

1. Run with `dry_run=True` (default) to plan actions without actually hitting IG.
   In this mode `fetch_recent_posts` returns synthetic stub posts so we can see
   the sweep flow end-to-end without an IG account or risk of bans.
2. Plug in a real instagrapi client when the user explicitly opts in via
   IG_DRY_RUN=false + IG_USERNAME / IG_PASSWORD.
3. Be mocked easily in tests.

Real instagrapi integration is intentionally minimal — just the ops we use.
Persistent device fingerprint + session is critical to avoid re-login risk.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol


@dataclass
class IGPost:
    """Subset of instagrapi.Media we care about."""
    post_id: str
    code: str            # short URL code (used to build https://instagram.com/p/<code>/)
    caption: str
    like_count: int
    comment_count: int
    posted_at: datetime
    is_video: bool

    @property
    def url(self) -> str:
        return f"https://instagram.com/p/{self.code}/" if self.code else ""


class InstagramClient(Protocol):
    """Minimum surface the sweep service depends on. Real + dry-run both implement this."""

    def fetch_recent_posts(self, username: str, limit: int = 3) -> list[IGPost]: ...
    def like_post(self, post_id: str) -> bool: ...
    def comment_post(self, post_id: str, text: str) -> bool: ...


class DryRunInstagramClient:
    """No real IG calls. Returns synthetic posts; like/comment just return True.

    Stub posts are deterministic per username so successive sweeps can detect
    "no new posts" correctly. Each call advances the synthetic post id by 1.
    """

    def __init__(self) -> None:
        # In-memory counter per username so each sweep "sees" a new fake post
        self._counter: dict[str, int] = {}

    def fetch_recent_posts(self, username: str, limit: int = 3) -> list[IGPost]:
        n = self._counter.get(username, 0) + 1
        self._counter[username] = n
        return [
            IGPost(
                post_id=f"dryrun_{username}_{n}",
                code=f"dryrun{n}",
                caption=f"[dry-run stub post #{n} from @{username}]",
                like_count=42 * n,
                comment_count=3 * n,
                posted_at=datetime.now(timezone.utc),
                is_video=False,
            )
        ][:limit]

    def like_post(self, post_id: str) -> bool:
        return True

    def comment_post(self, post_id: str, text: str) -> bool:
        return True


class RealInstagramClient:
    """Thin wrapper over instagrapi.Client.

    Instantiated lazily — instagrapi import is deferred so dry-run users don't
    need to install/import it (and we don't accidentally trigger a real session
    just by importing this module).

    Session persistence:
      - On construction we load_settings() if a session file exists.
      - We only call login() if we haven't already authenticated (probed via
        get_timeline_feed which requires auth).
      - After successful auth we dump_settings() so the next sweep reuses the
        cookies / device fingerprint instead of triggering "new login" alerts.

    This is the single most important defense against IG flagging the account
    as a bot — frequent re-logins from a server are the #1 ban trigger.
    """

    def __init__(self, username: str, password: str, session_path: Path | None = None) -> None:
        from instagrapi import Client  # local import — only loaded in real mode

        self._client = Client()
        self._session_path = session_path

        loaded_existing = False
        if session_path and session_path.exists():
            try:
                self._client.load_settings(str(session_path))
                loaded_existing = True
            except Exception:
                # Corrupted / version-mismatched session — wipe and fall through.
                self._client = Client()
                loaded_existing = False

        if loaded_existing:
            try:
                # Cheap auth probe; raises LoginRequired if session expired.
                self._client.get_timeline_feed()
                # Session valid — done. No login() call, no "new device" alert.
            except Exception:
                # Session expired — full login.
                self._client = Client()
                self._client.login(username, password)
        else:
            self._client.login(username, password)

        if session_path:
            session_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                self._client.dump_settings(str(session_path))
            except Exception:
                pass  # non-fatal — session reuse is an optimization

    def fetch_recent_posts(self, username: str, limit: int = 3) -> list[IGPost]:
        user_id = self._client.user_id_from_username(username)
        medias = self._client.user_medias(user_id, amount=limit)
        out: list[IGPost] = []
        for m in medias:
            posted = m.taken_at
            if posted.tzinfo is None:
                posted = posted.replace(tzinfo=timezone.utc)
            out.append(
                IGPost(
                    post_id=str(m.pk),
                    code=str(m.code or ""),
                    caption=str(m.caption_text or ""),
                    like_count=int(m.like_count or 0),
                    comment_count=int(m.comment_count or 0),
                    posted_at=posted,
                    is_video=bool(getattr(m, "media_type", 1) == 2),
                )
            )
        return out

    def like_post(self, post_id: str) -> bool:
        return bool(self._client.media_like(post_id))

    def comment_post(self, post_id: str, text: str) -> bool:
        result = self._client.media_comment(post_id, text)
        return bool(result)


def build_client(dry_run: bool, username: str = "", password: str = "", session_dir: Path | None = None) -> InstagramClient:
    """Factory used by sweep service. Picks dry-run vs real based on settings."""
    if dry_run or not username or not password:
        return DryRunInstagramClient()
    session_path = (session_dir / f"{username}.json") if session_dir else None
    return RealInstagramClient(username=username, password=password, session_path=session_path)
