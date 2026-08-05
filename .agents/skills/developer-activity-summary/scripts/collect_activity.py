#!/usr/bin/env python3
"""Collect bounded, read-only GitLab/GitHub activity evidence."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlencode
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class CollectorError(RuntimeError):
    pass


def parse_day(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid date {value!r}; use YYYY-MM-DD") from exc


def utc_bounds(start: date, end: date, zone: ZoneInfo) -> tuple[str, str]:
    start_dt = datetime.combine(start, time.min, zone).astimezone(timezone.utc)
    end_dt = datetime.combine(end + timedelta(days=1), time.min, zone).astimezone(timezone.utc)
    return iso_z(start_dt), iso_z(end_dt)


def iso_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def local_day(value: str | None, zone: ZoneInfo) -> str | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(zone).date().isoformat()


def day_keys(start: date, end: date) -> list[str]:
    return [(start + timedelta(days=offset)).isoformat() for offset in range((end - start).days + 1)]


def run_json(command: list[str]) -> Any:
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise CollectorError(f"required CLI not found: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "command failed").strip().replace("\n", " ")[:400]
        raise CollectorError(f"{command[0]} read-only API call failed: {detail}") from exc
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise CollectorError(f"{command[0]} returned invalid JSON") from exc


def run_ndjson(command: list[str]) -> list[dict[str, Any]]:
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise CollectorError(f"required CLI not found: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "command failed").strip().replace("\n", " ")[:400]
        raise CollectorError(f"{command[0]} read-only API call failed: {detail}") from exc

    records: list[dict[str, Any]] = []
    for number, line in enumerate(result.stdout.splitlines(), 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise CollectorError(f"{command[0]} returned invalid NDJSON on line {number}") from exc
        if isinstance(value, list):
            records.extend(item for item in value if isinstance(item, dict))
        elif isinstance(value, dict):
            records.append(value)
    return records


def glab_list(endpoint: str) -> list[dict[str, Any]]:
    return run_ndjson(["glab", "api", endpoint, "--paginate", "--output", "ndjson"])


def bounded_add(day: dict[str, Any], item: dict[str, Any], seen: set[tuple[Any, ...]], max_items: int) -> None:
    key = (
        item.get("provider"),
        item.get("project"),
        item.get("kind"),
        item.get("action"),
        item.get("title"),
        item.get("ref"),
        item.get("iid"),
    )
    if key in seen:
        return
    seen.add(key)
    if len(day["evidence"]) < max_items:
        day["evidence"].append(item)
    else:
        day["truncated"] += 1


def collect_gitlab(start: date, end: date, zone: ZoneInfo, max_items: int) -> dict[str, Any]:
    user = run_json(["glab", "api", "user"])
    user_id = user.get("id")
    if not user_id:
        raise CollectorError("glab user response did not include an id")

    after_utc, before_utc = utc_bounds(start, end, zone)
    # GitLab event filters use UTC calendar dates. Widen by one day on each
    # side, then apply the requested timezone locally so boundary events remain.
    events_query = urlencode(
        {
            "after": (start - timedelta(days=1)).isoformat(),
            "before": (end + timedelta(days=2)).isoformat(),
            "per_page": 100,
        }
    )
    common = {
        "scope": "all",
        "author_id": user_id,
        "updated_after": after_utc,
        "updated_before": before_utc,
        "per_page": 100,
    }
    events = glab_list(f"users/{user_id}/events?{events_query}")
    merge_requests = glab_list(f"merge_requests?{urlencode(common)}")
    issues = glab_list(f"issues?{urlencode(common)}")

    project_ids = {
        item.get("project_id")
        for item in [*events, *merge_requests, *issues]
        if item.get("project_id") is not None
    }
    projects: dict[int, str] = {}
    lookup_failures: list[int] = []
    project_lookup_limit = 50
    for index, project_id in enumerate(sorted(project_ids)):
        if index >= project_lookup_limit:
            projects[project_id] = str(project_id)
            lookup_failures.append(project_id)
            continue
        try:
            project = run_json(["glab", "api", f"projects/{project_id}"])
            projects[project_id] = project.get("path_with_namespace") or str(project_id)
        except CollectorError:
            projects[project_id] = str(project_id)
            lookup_failures.append(project_id)

    days = {
        key: {"actions": {}, "projects": [], "evidence": [], "truncated": 0}
        for key in day_keys(start, end)
    }
    seen = {key: set() for key in days}
    action_counts = {key: Counter() for key in days}
    project_sets = {key: set() for key in days}
    event_items: list[tuple[str, dict[str, Any]]] = []

    for event in sorted(events, key=lambda item: item.get("created_at") or ""):
        key = local_day(event.get("created_at"), zone)
        if key not in days:
            continue
        project = projects.get(event.get("project_id"), str(event.get("project_id") or "unknown"))
        push_data = event.get("push_data") or {}
        title = event.get("target_title") or push_data.get("commit_title") or None
        action = event.get("action_name") or "activity"
        action_counts[key][action] += 1
        project_sets[key].add(project)
        target_type = event.get("target_type")
        kind = {"MergeRequest": "merge_request", "Issue": "issue"}.get(target_type, target_type or "event")
        event_items.append(
            (
                key,
                {
                    "provider": "gitlab",
                    "project": project,
                    "kind": kind,
                    "action": action,
                    "title": title,
                    "ref": push_data.get("ref"),
                    "iid": event.get("target_iid"),
                },
            )
        )

    add_gitlab_work_items(
        merge_requests,
        "merge_request",
        projects,
        days,
        seen,
        action_counts,
        project_sets,
        zone,
        max_items,
    )
    add_gitlab_work_items(
        issues,
        "issue",
        projects,
        days,
        seen,
        action_counts,
        project_sets,
        zone,
        max_items,
    )

    priority = {"accepted": 0, "approved": 1, "opened": 2, "closed": 3, "pushed new": 4, "pushed to": 5, "deleted": 6}
    for key, item in sorted(event_items, key=lambda value: priority.get(value[1]["action"], 9)):
        bounded_add(days[key], item, seen[key], max_items)

    for key in days:
        days[key]["actions"] = dict(sorted(action_counts[key].items()))
        days[key]["projects"] = sorted(project_sets[key])

    return {
        "identity": {
            "username": user.get("username"),
            "name": user.get("name"),
            "web_url": user.get("web_url"),
        },
        "range": {"from": start.isoformat(), "to": end.isoformat()},
        "evidence_complete": not lookup_failures,
        "limitations": (
            [{"type": "project_identity_incomplete", "project_ids": lookup_failures}]
            if lookup_failures
            else []
        ),
        "days": days,
    }


def add_gitlab_work_items(
    records: Iterable[dict[str, Any]],
    kind: str,
    projects: dict[int, str],
    days: dict[str, dict[str, Any]],
    seen: dict[str, set[tuple[Any, ...]]],
    action_counts: dict[str, Counter[str]],
    project_sets: dict[str, set[str]],
    zone: ZoneInfo,
    max_items: int,
) -> None:
    for record in records:
        milestones: list[tuple[str, str]] = []
        for field, action in (("created_at", "opened"), ("merged_at", "merged"), ("closed_at", "closed")):
            key = local_day(record.get(field), zone)
            if key in days:
                milestones.append((key, action))
        if not milestones:
            key = local_day(record.get("updated_at"), zone)
            if key in days:
                milestones.append((key, "updated"))
        project = projects.get(record.get("project_id"), str(record.get("project_id") or "unknown"))
        for key, action in milestones:
            action_counts[key][f"{kind}_{action}"] += 1
            project_sets[key].add(project)
            bounded_add(
                days[key],
                {
                    "provider": "gitlab",
                    "project": project,
                    "kind": kind,
                    "action": action,
                    "title": record.get("title"),
                    "iid": record.get("iid"),
                    "state": record.get("state"),
                    "draft": record.get("draft") or record.get("work_in_progress") or False,
                },
                seen[key],
                max_items,
            )


def collect_github(start: date, end: date, zone: ZoneInfo, max_items: int) -> dict[str, Any]:
    user = run_json(["gh", "api", "user"])
    login = user.get("login")
    if not login:
        raise CollectorError("gh user response did not include a login")
    from_utc, to_utc = utc_bounds(start, end, zone)
    query = """
query($login:String!,$from:DateTime!,$to:DateTime!){
  user(login:$login){
    contributionsCollection(from:$from,to:$to){
      restrictedContributionsCount
      commitContributionsByRepository(maxRepositories:100){
        repository{nameWithOwner}
        contributions(first:100){pageInfo{hasNextPage} nodes{occurredAt commitCount}}
      }
      pullRequestContributions(first:100){
        pageInfo{hasNextPage}
        nodes{occurredAt pullRequest{title state url repository{nameWithOwner}}}
      }
      pullRequestReviewContributions(first:100){
        pageInfo{hasNextPage}
        nodes{occurredAt pullRequest{title state url repository{nameWithOwner}}}
      }
      issueContributions(first:100){
        pageInfo{hasNextPage}
        nodes{occurredAt issue{title state url repository{nameWithOwner}}}
      }
    }
  }
}
""".strip()
    response = run_json(
        [
            "gh",
            "api",
            "graphql",
            "-f",
            f"query={query}",
            "-F",
            f"login={login}",
            "-F",
            f"from={from_utc}",
            "-F",
            f"to={to_utc}",
        ]
    )
    try:
        collection = response["data"]["user"]["contributionsCollection"]
    except (KeyError, TypeError) as exc:
        raise CollectorError("GitHub contribution response had an unexpected shape") from exc

    limitations: list[dict[str, Any]] = []
    commit_groups = collection.get("commitContributionsByRepository") or []
    if len(commit_groups) >= 100:
        limitations.append({"type": "github_repository_limit_reached", "limit": 100})
    if any(
        ((group.get("contributions") or {}).get("pageInfo") or {}).get("hasNextPage")
        for group in commit_groups
    ):
        limitations.append({"type": "github_commit_connection_truncated", "limit": 100})
    for field in ("pullRequestContributions", "pullRequestReviewContributions", "issueContributions"):
        if ((collection.get(field) or {}).get("pageInfo") or {}).get("hasNextPage"):
            limitations.append({"type": f"{field}_truncated", "limit": 100})
    restricted = collection.get("restrictedContributionsCount") or 0
    if restricted:
        limitations.append({"type": "restricted_contributions", "count": restricted})

    days = {
        key: {"actions": {}, "projects": [], "evidence": [], "truncated": 0}
        for key in day_keys(start, end)
    }
    seen = {key: set() for key in days}
    action_counts = {key: Counter() for key in days}
    project_sets = {key: set() for key in days}

    for group in commit_groups:
        project = ((group.get("repository") or {}).get("nameWithOwner")) or "unknown"
        nodes = ((group.get("contributions") or {}).get("nodes")) or []
        for node in nodes:
            add_github_item(
                node.get("occurredAt"), project, "commit", "committed", None,
                node.get("commitCount") or 0, days, seen, action_counts, project_sets, zone, max_items,
            )

    for field, kind, action, object_name in (
        ("pullRequestContributions", "pull_request", "opened", "pullRequest"),
        ("pullRequestReviewContributions", "pull_request_review", "reviewed", "pullRequest"),
        ("issueContributions", "issue", "opened", "issue"),
    ):
        for node in (collection.get(field) or {}).get("nodes") or []:
            item = node.get(object_name) or {}
            repository = item.get("repository") or {}
            add_github_item(
                node.get("occurredAt"), repository.get("nameWithOwner") or "unknown", kind, action,
                item.get("title"), 1, days, seen, action_counts, project_sets, zone, max_items,
            )

    for key in days:
        days[key]["actions"] = dict(sorted(action_counts[key].items()))
        days[key]["projects"] = sorted(project_sets[key])

    return {
        "identity": {"username": login, "name": user.get("name"), "web_url": user.get("html_url")},
        "range": {"from": start.isoformat(), "to": end.isoformat()},
        "evidence_complete": not limitations,
        "limitations": limitations,
        "restricted_contributions": restricted,
        "days": days,
    }


def add_github_item(
    occurred_at: str | None,
    project: str,
    kind: str,
    action: str,
    title: str | None,
    count: int,
    days: dict[str, dict[str, Any]],
    seen: dict[str, set[tuple[Any, ...]]],
    action_counts: dict[str, Counter[str]],
    project_sets: dict[str, set[str]],
    zone: ZoneInfo,
    max_items: int,
) -> None:
    key = local_day(occurred_at, zone)
    if key not in days:
        return
    action_counts[key][action] += count
    project_sets[key].add(project)
    bounded_add(
        days[key],
        {"provider": "github", "project": project, "kind": kind, "action": action, "title": title, "count": count},
        seen[key],
        max_items,
    )


def paired_range(parser: argparse.ArgumentParser, start: date | None, end: date | None, name: str) -> None:
    if (start is None) != (end is None):
        parser.error(f"--{name}-from and --{name}-to must be supplied together")
    if start and end and end < start:
        parser.error(f"--{name}-to must not be earlier than --{name}-from")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gitlab-from", type=parse_day)
    parser.add_argument("--gitlab-to", type=parse_day)
    parser.add_argument("--github-from", type=parse_day)
    parser.add_argument("--github-to", type=parse_day)
    parser.add_argument("--timezone", required=True)
    parser.add_argument("--role", choices=("primary", "supplemental"), default="primary")
    parser.add_argument("--max-items-per-day", type=int, default=40)
    parser.add_argument("--output", type=Path, help="write normalized JSON to this path instead of stdout")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    paired_range(parser, args.gitlab_from, args.gitlab_to, "gitlab")
    paired_range(parser, args.github_from, args.github_to, "github")
    if not args.gitlab_from and not args.github_from:
        parser.error("supply at least one provider date range")
    if not 1 <= args.max_items_per_day <= 100:
        parser.error("--max-items-per-day must be between 1 and 100")
    try:
        zone = ZoneInfo(args.timezone)
    except ZoneInfoNotFoundError:
        parser.error(f"unknown timezone: {args.timezone}")

    try:
        report: dict[str, Any] = {"timezone": args.timezone, "report_role": args.role, "providers": {}}
        if args.gitlab_from:
            report["providers"]["gitlab"] = collect_gitlab(
                args.gitlab_from, args.gitlab_to, zone, args.max_items_per_day
            )
        if args.github_from:
            report["providers"]["github"] = collect_github(
                args.github_from, args.github_to, zone, args.max_items_per_day
            )
    except CollectorError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
        print(args.output)
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
