"""DryRunInstagramClient — verify factory + stub behavior. RealInstagramClient
is NOT instantiated here (would try to login to IG)."""

from services.instagram_client import (
    DryRunInstagramClient,
    build_client,
)


def test_dry_run_returns_synthetic_post():
    c = DryRunInstagramClient()
    posts = c.fetch_recent_posts("alice", limit=3)
    assert len(posts) == 1
    assert posts[0].post_id.startswith("dryrun_alice_")


def test_dry_run_post_id_increments_per_call():
    c = DryRunInstagramClient()
    p1 = c.fetch_recent_posts("alice")[0]
    p2 = c.fetch_recent_posts("alice")[0]
    assert p1.post_id != p2.post_id  # successive calls produce "new" posts


def test_dry_run_like_and_comment_return_true():
    c = DryRunInstagramClient()
    assert c.like_post("anything") is True
    assert c.comment_post("anything", "hi") is True


def test_factory_returns_dry_run_when_dry_flag():
    c = build_client(dry_run=True)
    assert isinstance(c, DryRunInstagramClient)


def test_factory_returns_dry_run_when_creds_missing():
    """Even if dry_run=False, missing creds should fall back to dry-run rather
    than crash on login."""
    c = build_client(dry_run=False, username="", password="")
    assert isinstance(c, DryRunInstagramClient)
