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
from urllib.parse import unquote, urlencode, urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


DEFAULT_TIMEZONE = "Asia/Taipei"


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


def tracked_local_day(
    value: Any,
    zone: ZoneInfo,
    failures: Counter[str],
    required: bool = False,
) -> str | None:
    if value is None or value == "":
        if required:
            failures["missing"] += 1
        return None
    if not isinstance(value, str):
        failures["malformed"] += 1
        return None
    try:
        return local_day(value, zone)
    except ValueError:
        failures["malformed"] += 1
        return None


def add_timestamp_limitations(
    limitations: list[dict[str, Any]], provider: str, failures: Counter[str]
) -> None:
    for reason in ("missing", "malformed"):
        if failures[reason]:
            limitations.append(
                {"type": f"{provider}_activity_timestamp_{reason}", "count": failures[reason]}
            )


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


def dedup_key_part(value: Any) -> Any:
    try:
        hash(value)
    except TypeError:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return value


def gitlab_event_timestamp_sort_key(event: dict[str, Any]) -> str:
    value = event.get("created_at")
    return value if isinstance(value, str) else ""


def bounded_add(day: dict[str, Any], item: dict[str, Any], seen: set[tuple[Any, ...]], max_items: int) -> None:
    key = tuple(
        dedup_key_part(item.get(field))
        for field in ("provider", "project", "kind", "action", "title", "ref", "iid", "number")
    )
    if key in seen:
        return
    seen.add(key)
    if len(day["evidence"]) < max_items:
        day["evidence"].append(item)
    else:
        day["truncated"] += 1


def is_api_identifier(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def gitlab_item_key(project_id: Any, iid: Any) -> tuple[int, int] | None:
    if not is_api_identifier(project_id) or not is_api_identifier(iid):
        return None
    return project_id, iid


def verified_gitlab_project_path(response: Any, expected_project_id: int) -> str | None:
    if not isinstance(response, dict):
        return None
    if not is_api_identifier(response.get("id")) or response.get("id") != expected_project_id:
        return None
    project_path = response.get("path_with_namespace")
    if not isinstance(project_path, str) or not project_path.strip():
        return None
    return project_path


def is_safe_http_url(url: Any) -> bool:
    if not isinstance(url, str) or not url.strip():
        return False
    parsed = urlparse(url)
    return (
        parsed.scheme in {"http", "https"}
        and bool(parsed.netloc)
        and parsed.username is None
        and parsed.password is None
    )


def linked_url_matches(url: Any, project: str, identifier: int, provider: str) -> bool:
    if not is_safe_http_url(url) or not project.strip() or not is_api_identifier(identifier):
        return False
    path = unquote(urlparse(url).path).rstrip("/")
    if provider == "gitlab":
        return path == f"/{project.strip('/')}/-/merge_requests/{identifier}"
    if provider == "github":
        return path == f"/{project.strip('/')}/pull/{identifier}"
    return False


def has_complete_link_details(identifier: Any, url: Any, state: Any) -> bool:
    return (
        is_api_identifier(identifier)
        and is_safe_http_url(url)
        and isinstance(state, str)
        and bool(state.strip())
    )


def resolve_gitlab_merge_request_details(
    events: Iterable[dict[str, Any]],
    records: Iterable[dict[str, Any]],
    lookup_limit: int = 50,
) -> tuple[dict[tuple[int, int], dict[str, Any]], list[dict[str, Any]]]:
    records = list(records)
    events = list(events)
    details: dict[tuple[int, int], dict[str, Any]] = {}
    record_keys: set[tuple[int, int]] = set()
    event_keys: set[tuple[int, int]] = set()
    failures = 0
    for record in records:
        if not isinstance(record, dict):
            failures += 1
            continue
        key = gitlab_item_key(record.get("project_id"), record.get("iid"))
        if key is None:
            failures += 1
            continue
        record_keys.add(key)
        if has_complete_link_details(
            record.get("iid"), record.get("web_url"), record.get("state")
        ):
            details[key] = record
    for event in events:
        if not isinstance(event, dict):
            failures += 1
            continue
        if event.get("target_type") != "MergeRequest":
            continue
        key = gitlab_item_key(event.get("project_id"), event.get("target_iid"))
        if key is None:
            failures += 1
            continue
        event_keys.add(key)
    skipped = 0
    lookups = 0
    for project_id, iid in sorted(record_keys | event_keys):
        if (project_id, iid) in details:
            continue
        if lookups >= lookup_limit:
            skipped += 1
            continue
        lookups += 1
        try:
            record = run_json(["glab", "api", f"projects/{project_id}/merge_requests/{iid}"])
        except CollectorError:
            failures += 1
            continue
        if (
            not isinstance(record, dict)
            or not is_api_identifier(record.get("project_id"))
            or record.get("project_id") != project_id
            or record.get("iid") != iid
            or not has_complete_link_details(
                record.get("iid"), record.get("web_url"), record.get("state")
            )
        ):
            failures += 1
            continue
        details[(project_id, iid)] = record

    limitations: list[dict[str, Any]] = []
    if failures:
        limitations.append({"type": "gitlab_merge_request_detail_lookup_failed", "count": failures})
    if skipped:
        limitations.append(
            {
                "type": "gitlab_merge_request_detail_lookup_limit_reached",
                "limit": lookup_limit,
                "count": skipped,
            }
        )
    return details, limitations


def collect_gitlab(start: date, end: date, zone: ZoneInfo, max_items: int) -> dict[str, Any]:
    user = run_json(["glab", "api", "user"])
    if not isinstance(user, dict):
        raise CollectorError("glab user response had an unexpected shape")
    user_id = user.get("id")
    if not is_api_identifier(user_id):
        raise CollectorError("glab user response did not include a valid id")

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
    merge_request_details, merge_request_limitations = resolve_gitlab_merge_request_details(
        events, merge_requests
    )
    merge_requests = [
        merge_request_details.get(
            gitlab_item_key(record.get("project_id"), record.get("iid")), record
        )
        for record in merge_requests
    ]

    project_ids: set[int] = set()
    invalid_project_identifiers = 0
    for item in [*events, *merge_requests, *issues]:
        project_id = item.get("project_id")
        if project_id is None:
            continue
        if not is_api_identifier(project_id):
            invalid_project_identifiers += 1
            continue
        project_ids.add(project_id)
    if invalid_project_identifiers:
        merge_request_limitations.append(
            {"type": "gitlab_project_identifier_invalid", "count": invalid_project_identifiers}
        )
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
        except CollectorError:
            project = None
        project_path = verified_gitlab_project_path(project, project_id)
        if project_path is None:
            projects[project_id] = str(project_id)
            lookup_failures.append(project_id)
            continue
        projects[project_id] = project_path

    verified_project_ids = set(project_ids) - set(lookup_failures)
    timestamp_failures: Counter[str] = Counter()
    days = {
        key: {"actions": {}, "projects": [], "evidence": [], "truncated": 0}
        for key in day_keys(start, end)
    }
    seen = {key: set() for key in days}
    action_counts = {key: Counter() for key in days}
    project_sets = {key: set() for key in days}
    event_items: list[tuple[str, dict[str, Any]]] = []
    malformed_event_payloads = 0
    linked_item_failures: Counter[str] = Counter()

    for event in sorted(events, key=gitlab_event_timestamp_sort_key):
        key = tracked_local_day(event.get("created_at"), zone, timestamp_failures, required=True)
        if key not in days:
            continue
        event_project_id = event.get("project_id")
        project = (
            projects.get(event_project_id, str(event_project_id))
            if is_api_identifier(event_project_id)
            else "unknown"
        )
        raw_push_data = event.get("push_data")
        if raw_push_data is None:
            push_data = {}
        elif isinstance(raw_push_data, dict):
            push_data = raw_push_data
        else:
            malformed_event_payloads += 1
            push_data = {}
        raw_title = event.get("target_title") or push_data.get("commit_title")
        if raw_title is not None and not isinstance(raw_title, str):
            malformed_event_payloads += 1
            raw_title = None
        raw_action = event.get("action_name")
        if raw_action is None:
            action = "activity"
        elif isinstance(raw_action, str) and raw_action.strip():
            action = raw_action
        else:
            malformed_event_payloads += 1
            action = "activity"
        raw_target_type = event.get("target_type")
        if raw_target_type is not None and not isinstance(raw_target_type, str):
            malformed_event_payloads += 1
            raw_target_type = None
        target_type = raw_target_type
        kind = {"MergeRequest": "merge_request", "Issue": "issue"}.get(target_type, target_type or "event")
        raw_ref = push_data.get("ref")
        if raw_ref is not None and not isinstance(raw_ref, str):
            malformed_event_payloads += 1
            raw_ref = None
        target_iid = event.get("target_iid")
        if target_iid is not None and not is_api_identifier(target_iid):
            malformed_event_payloads += 1
            target_iid = None
        action_counts[key][action] += 1
        project_sets[key].add(project)
        event_item = {
            "provider": "gitlab",
            "project": project,
            "kind": kind,
            "action": action,
            "title": raw_title,
            "ref": raw_ref,
            "iid": target_iid,
        }
        if target_type == "MergeRequest":
            detail_key = gitlab_item_key(event_project_id, target_iid)
            detail = merge_request_details.get(detail_key) if detail_key is not None else None
            valid_link = bool(
                detail
                and event_project_id in verified_project_ids
                and linked_url_matches(detail.get("web_url"), project, detail["iid"], "gitlab")
            )
            if valid_link and detail:
                detail_title = detail.get("title")
                if detail_title is not None and not isinstance(detail_title, str):
                    malformed_event_payloads += 1
                    detail_title = None
                event_item.update(
                    {
                        "title": raw_title or detail_title,
                        "iid": detail["iid"],
                        "state": detail.get("state"),
                        "url": detail.get("web_url"),
                    }
                )
            else:
                if detail and event_project_id in verified_project_ids:
                    linked_item_failures["invalid"] += 1
                event_item.update({"kind": "event", "iid": None})
        event_items.append((key, event_item))

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
        verified_project_ids=verified_project_ids,
        timestamp_failures=timestamp_failures,
        linked_item_failures=linked_item_failures,
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
        verified_project_ids=verified_project_ids,
        timestamp_failures=timestamp_failures,
        linked_item_failures=linked_item_failures,
    )

    priority = {"accepted": 0, "approved": 1, "opened": 2, "closed": 3, "pushed new": 4, "pushed to": 5, "deleted": 6}
    for key, item in sorted(event_items, key=lambda value: priority.get(value[1]["action"], 9)):
        bounded_add(days[key], item, seen[key], max_items)

    for key in days:
        days[key]["actions"] = dict(sorted(action_counts[key].items()))
        days[key]["projects"] = sorted(project_sets[key])

    add_timestamp_limitations(merge_request_limitations, "gitlab", timestamp_failures)
    if malformed_event_payloads:
        merge_request_limitations.append(
            {"type": "gitlab_event_payload_malformed", "count": malformed_event_payloads}
        )
    if linked_item_failures["invalid"]:
        merge_request_limitations.append(
            {"type": "gitlab_merge_request_link_invalid", "count": linked_item_failures["invalid"]}
        )
    return {
        "identity": {
            "username": user.get("username"),
            "name": user.get("name"),
            "web_url": user.get("web_url"),
        },
        "range": {"from": start.isoformat(), "to": end.isoformat()},
        "evidence_complete": not lookup_failures and not merge_request_limitations,
        "limitations": (
            (
                [{"type": "project_identity_incomplete", "project_ids": lookup_failures}]
                if lookup_failures
                else []
            )
            + merge_request_limitations
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
    verified_project_ids: set[Any] | None = None,
    timestamp_failures: Counter[str] | None = None,
    linked_item_failures: Counter[str] | None = None,
) -> None:
    for record in records:
        milestones: list[tuple[str, str]] = []
        for field, action in (("created_at", "opened"), ("merged_at", "merged"), ("closed_at", "closed")):
            required = field == "created_at"
            key = (
                tracked_local_day(record.get(field), zone, timestamp_failures, required=required)
                if timestamp_failures is not None
                else local_day(record.get(field), zone)
            )
            if key in days:
                milestones.append((key, action))
        if not milestones:
            key = (
                tracked_local_day(record.get("updated_at"), zone, timestamp_failures, required=True)
                if timestamp_failures is not None
                else local_day(record.get("updated_at"), zone)
            )
            if key in days:
                milestones.append((key, "updated"))
        record_project_id = record.get("project_id")
        project = (
            projects.get(record_project_id, str(record_project_id))
            if is_api_identifier(record_project_id)
            else "unknown"
        )
        project_verified = (
            verified_project_ids is None
            or (
                is_api_identifier(record_project_id)
                and record_project_id in verified_project_ids
            )
        )
        link_details_complete = has_complete_link_details(
            record.get("iid"), record.get("web_url"), record.get("state")
        )
        link_matches_project = link_details_complete and linked_url_matches(
            record.get("web_url"), project, record.get("iid"), "gitlab"
        )
        complete_merge_request = kind != "merge_request" or (
            project_verified and link_matches_project
        )
        if (
            kind == "merge_request"
            and project_verified
            and link_details_complete
            and not link_matches_project
            and linked_item_failures is not None
        ):
            linked_item_failures["invalid"] += 1
        evidence_kind = kind if complete_merge_request else "event"
        for key, action in milestones:
            action_counts[key][f"{evidence_kind}_{action}"] += 1
            project_sets[key].add(project)
            item = {
                "provider": "gitlab",
                "project": project,
                "kind": evidence_kind,
                "action": action,
                "title": record.get("title"),
            }
            if complete_merge_request:
                item.update(
                    {
                        "iid": record.get("iid"),
                        "state": record.get("state"),
                        "url": record.get("web_url"),
                        "draft": record.get("draft") or record.get("work_in_progress") or False,
                    }
                )
            bounded_add(days[key], item, seen[key], max_items)


def collect_github(start: date, end: date, zone: ZoneInfo, max_items: int) -> dict[str, Any]:
    user = run_json(["gh", "api", "user"])
    if not isinstance(user, dict):
        raise CollectorError("gh user response had an unexpected shape")
    login = user.get("login")
    if not isinstance(login, str) or not login.strip():
        raise CollectorError("gh user response did not include a valid login")
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
        nodes{occurredAt pullRequest{number title state url repository{nameWithOwner}}}
      }
      pullRequestReviewContributions(first:100){
        pageInfo{hasNextPage}
        nodes{occurredAt pullRequest{number title state url repository{nameWithOwner}}}
      }
      issueContributions(first:100){
        pageInfo{hasNextPage}
        nodes{occurredAt issue{number title state url repository{nameWithOwner}}}
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
    if not isinstance(collection, dict):
        raise CollectorError("GitHub contribution response had an unexpected shape")

    limitations: list[dict[str, Any]] = []
    raw_commit_groups = collection.get("commitContributionsByRepository") or []
    malformed_commit_payloads = 0
    if not isinstance(raw_commit_groups, list):
        malformed_commit_payloads += 1
        raw_commit_groups = []
    commit_entries: list[tuple[str, list[dict[str, Any]], bool]] = []
    for group in raw_commit_groups:
        if not isinstance(group, dict):
            malformed_commit_payloads += 1
            continue
        repository = group.get("repository")
        contributions = group.get("contributions")
        if not isinstance(repository, dict) or not isinstance(contributions, dict):
            malformed_commit_payloads += 1
            continue
        nodes = contributions.get("nodes") or []
        page_info = contributions.get("pageInfo") or {}
        if not isinstance(nodes, list) or not isinstance(page_info, dict):
            malformed_commit_payloads += 1
            continue
        valid_nodes = []
        for node in nodes:
            if not isinstance(node, dict):
                malformed_commit_payloads += 1
                continue
            commit_count = node.get("commitCount")
            if (
                not isinstance(commit_count, int)
                or isinstance(commit_count, bool)
                or commit_count < 0
            ):
                malformed_commit_payloads += 1
                continue
            valid_nodes.append(node)
        project = repository.get("nameWithOwner")
        if not isinstance(project, str) or not project.strip():
            malformed_commit_payloads += 1
            project = "unknown"
        commit_entries.append((project, valid_nodes, bool(page_info.get("hasNextPage"))))
    if len(raw_commit_groups) >= 100:
        limitations.append({"type": "github_repository_limit_reached", "limit": 100})
    if any(has_next_page for _, _, has_next_page in commit_entries):
        limitations.append({"type": "github_commit_connection_truncated", "limit": 100})
    if malformed_commit_payloads:
        limitations.append({"type": "github_commit_payload_malformed", "count": malformed_commit_payloads})

    connection_nodes: dict[str, list[Any]] = {}
    malformed_connections = 0
    for field in ("pullRequestContributions", "pullRequestReviewContributions", "issueContributions"):
        connection = collection.get(field)
        if not isinstance(connection, dict):
            malformed_connections += 1
            connection_nodes[field] = []
            continue
        nodes = connection.get("nodes") or []
        page_info = connection.get("pageInfo") or {}
        if not isinstance(nodes, list):
            malformed_connections += 1
            nodes = []
        if not isinstance(page_info, dict):
            malformed_connections += 1
            page_info = {}
        connection_nodes[field] = nodes
        if page_info.get("hasNextPage"):
            limitations.append({"type": f"{field}_truncated", "limit": 100})
    if malformed_connections:
        limitations.append({"type": "github_connection_payload_malformed", "count": malformed_connections})

    restricted = collection.get("restrictedContributionsCount") or 0
    if not isinstance(restricted, int) or isinstance(restricted, bool):
        limitations.append({"type": "github_restricted_count_malformed"})
        restricted = 0
    if restricted:
        limitations.append({"type": "restricted_contributions", "count": restricted})

    timestamp_failures: Counter[str] = Counter()
    days = {
        key: {"actions": {}, "projects": [], "evidence": [], "truncated": 0}
        for key in day_keys(start, end)
    }
    seen = {key: set() for key in days}
    action_counts = {key: Counter() for key in days}
    project_sets = {key: set() for key in days}

    for project, nodes, _ in commit_entries:
        for node in nodes:
            add_github_item(
                node.get("occurredAt"), project, "commit", "committed", None,
                node["commitCount"], days, seen, action_counts, project_sets, zone, max_items,
                timestamp_failures=timestamp_failures,
            )

    incomplete_pull_requests = 0
    malformed_contributions = 0
    for field, kind, action, object_name in (
        ("pullRequestContributions", "pull_request", "opened", "pullRequest"),
        ("pullRequestReviewContributions", "pull_request_review", "reviewed", "pullRequest"),
        ("issueContributions", "issue", "opened", "issue"),
    ):
        for node in connection_nodes[field]:
            if not isinstance(node, dict):
                malformed_contributions += 1
                continue
            item = node.get(object_name)
            if not isinstance(item, dict):
                malformed_contributions += 1
                if kind in {"pull_request", "pull_request_review"}:
                    incomplete_pull_requests += 1
                add_github_item(
                    node.get("occurredAt"), "unknown", "event", action, None, 1,
                    days, seen, action_counts, project_sets, zone, max_items,
                    timestamp_failures=timestamp_failures,
                )
                continue
            repository = item.get("repository")
            effective_kind = kind
            if not isinstance(repository, dict):
                malformed_contributions += 1
                repository = {}
                effective_kind = "event"
            project = repository.get("nameWithOwner")
            if not isinstance(project, str) or not project.strip():
                malformed_contributions += 1
                project = "unknown"
                effective_kind = "event"
            if kind in {"pull_request", "pull_request_review"} and (
                effective_kind == "event"
                or not has_complete_link_details(
                    item.get("number"), item.get("url"), item.get("state")
                )
                or not linked_url_matches(
                    item.get("url"), project, item.get("number"), "github"
                )
            ):
                incomplete_pull_requests += 1
            add_github_item(
                node.get("occurredAt"), project, effective_kind, action,
                item.get("title"), 1, days, seen, action_counts, project_sets, zone, max_items,
                timestamp_failures=timestamp_failures,
                url=item.get("url"), number=item.get("number"), state=item.get("state"),
            )
    if incomplete_pull_requests:
        limitations.append({"type": "github_pull_request_details_incomplete", "count": incomplete_pull_requests})
    if malformed_contributions:
        limitations.append({"type": "github_contribution_payload_malformed", "count": malformed_contributions})
    add_timestamp_limitations(limitations, "github", timestamp_failures)

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
    timestamp_failures: Counter[str] | None = None,
    url: str | None = None,
    number: int | None = None,
    state: str | None = None,
) -> None:
    key = (
        tracked_local_day(occurred_at, zone, timestamp_failures, required=True)
        if timestamp_failures is not None
        else local_day(occurred_at, zone)
    )
    if key not in days:
        return
    action_counts[key][action] += count
    project_sets[key].add(project)
    complete_pull_request = (
        kind not in {"pull_request", "pull_request_review"}
        or (
            has_complete_link_details(number, url, state)
            and linked_url_matches(url, project, number, "github")
        )
    )
    item = {
        "provider": "github",
        "project": project,
        "kind": kind if complete_pull_request else "event",
        "action": action,
        "title": title,
        "count": count,
    }
    linked_pull_request = kind in {"pull_request", "pull_request_review"}
    if linked_pull_request and complete_pull_request:
        item.update({"url": url, "number": number, "state": state})
    bounded_add(days[key], item, seen[key], max_items)


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
    parser.add_argument(
        "--timezone",
        default=DEFAULT_TIMEZONE,
        help=f"IANA timezone for calendar-day grouping (default: {DEFAULT_TIMEZONE})",
    )
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
