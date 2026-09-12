#!/usr/bin/env python3
"""Summarize Kubernetes manifests as compact JSON.

This script is intentionally lossy. It extracts review-relevant fields from a
rendered manifest so agents do not need to load large Helm output into context.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import yaml


MAX_FINDINGS = 500

IMPORTANT_KINDS = {
    "Deployment",
    "Service",
    "ServiceAccount",
    "HorizontalPodAutoscaler",
    "PodDisruptionBudget",
    "ConfigMap",
    "Secret",
    "ExternalSecret",
    "Ingress",
    "Job",
    "ScaledObject",
}


def extract_helm_manifest(text: str) -> str:
    """Remove Helm dry-run release headers while retaining hooks and manifests."""
    lines = text.splitlines()
    section_indexes = [
        index for index, line in enumerate(lines) if line in {"HOOKS:", "MANIFEST:"}
    ]
    if section_indexes:
        selected: list[str] = []
        for line in lines[section_indexes[0] + 1 :]:
            if line == "NOTES:":
                break
            if line in {"HOOKS:", "MANIFEST:"}:
                continue
            selected.append(line)
        return "\n".join(selected)

    for index, line in enumerate(lines):
        if line.strip() == "---" or line.startswith("apiVersion:"):
            return "\n".join(lines[index:])
    return text


def load_docs(path: str | None, helm_output: bool = False) -> list[dict[str, Any]]:
    text = sys.stdin.read() if not path or path == "-" else Path(path).read_text(encoding="utf-8")
    if helm_output:
        text = extract_helm_manifest(text)
    docs: list[dict[str, Any]] = []
    for index, doc in enumerate(yaml.safe_load_all(text), start=1):
        if doc is None:
            continue
        if not isinstance(doc, dict):
            raise ValueError(f"manifest document {index} is not a Kubernetes object")
        docs.append(doc)
    return docs


def get_path(data: Any, *parts: str) -> Any:
    current = data
    for part in parts:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def metadata(doc: dict[str, Any]) -> dict[str, Any]:
    raw = doc.get("metadata")
    return raw if isinstance(raw, dict) else {}


def kind(doc: dict[str, Any]) -> str:
    return str(doc.get("kind", ""))


def name(doc: dict[str, Any]) -> str:
    return str(metadata(doc).get("name", ""))


def namespace(doc: dict[str, Any]) -> str | None:
    value = metadata(doc).get("namespace")
    return str(value) if value else None


def container_summary(container: dict[str, Any]) -> dict[str, Any]:
    resources = container.get("resources") if isinstance(container.get("resources"), dict) else {}
    env_from = []
    for item in container.get("envFrom", []) or []:
        if "configMapRef" in item:
            env_from.append({"type": "ConfigMap", "name": item["configMapRef"].get("name")})
        if "secretRef" in item:
            env_from.append({"type": "Secret", "name": item["secretRef"].get("name")})
    probes = {
        "readiness": "readinessProbe" in container,
        "liveness": "livenessProbe" in container,
        "startup": "startupProbe" in container,
    }
    return {
        "name": container.get("name"),
        "image": container.get("image"),
        "env_from": env_from,
        "resources": {
            "requests": resources.get("requests") or {},
            "limits": resources.get("limits") or {},
        },
        "probes": probes,
    }


def scaled_trigger_summary(trigger: dict[str, Any]) -> dict[str, Any]:
    metadata = trigger.get("metadata")
    authentication = trigger.get("authenticationRef")
    authentication = authentication if isinstance(authentication, dict) else {}
    return {
        "type": trigger.get("type"),
        "name": trigger.get("name"),
        "metadata_keys": sorted(metadata) if isinstance(metadata, dict) else [],
        "authentication_ref": {
            "name": authentication.get("name"),
            "kind": authentication.get("kind"),
        },
    }


def summarize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    doc_kind = kind(doc)
    item: dict[str, Any] = {
        "apiVersion": str(doc.get("apiVersion", "")),
        "kind": doc_kind,
        "name": name(doc),
    }
    ns = namespace(doc)
    if ns:
        item["namespace"] = ns

    spec = doc.get("spec") if isinstance(doc.get("spec"), dict) else {}
    annotations = metadata(doc).get("annotations")
    if isinstance(annotations, dict):
        selected_annotations = {
            key: value
            for key, value in annotations.items()
            if key in {
                "iam.gke.io/gcp-service-account",
                "cloud.google.com/neg",
                "cloud.google.com/backend-config",
                "meta.helm.sh/release-name",
            }
            or key.startswith("reloader.stakater.com/")
        }
        if selected_annotations:
            item["annotations"] = selected_annotations

    if doc_kind == "Deployment":
        pod_spec = get_path(spec, "template", "spec") or {}
        containers = pod_spec.get("containers", []) if isinstance(pod_spec, dict) else []
        item["selector"] = get_path(spec, "selector", "matchLabels") or {}
        item["service_account_name"] = pod_spec.get("serviceAccountName") if isinstance(pod_spec, dict) else None
        item["replicas"] = spec.get("replicas")
        item["strategy"] = spec.get("strategy") or {}
        item["containers"] = [
            container_summary(container)
            for container in containers
            if isinstance(container, dict)
        ]
    elif doc_kind == "Service":
        item["type"] = spec.get("type", "ClusterIP")
        item["selector"] = spec.get("selector") or {}
        item["ports"] = [
            {
                "name": port.get("name"),
                "port": port.get("port"),
                "targetPort": port.get("targetPort"),
                "protocol": port.get("protocol"),
            }
            for port in spec.get("ports", []) or []
            if isinstance(port, dict)
        ]
    elif doc_kind == "ServiceAccount":
        item["gsa"] = (item.get("annotations") or {}).get("iam.gke.io/gcp-service-account")
    elif doc_kind == "HorizontalPodAutoscaler":
        item["min_replicas"] = spec.get("minReplicas")
        item["max_replicas"] = spec.get("maxReplicas")
        item["metrics"] = spec.get("metrics") or []
    elif doc_kind == "PodDisruptionBudget":
        item["min_available"] = spec.get("minAvailable")
        item["max_unavailable"] = spec.get("maxUnavailable")
    elif doc_kind in {"ConfigMap", "Secret"}:
        data = doc.get("data")
        string_data = doc.get("stringData")
        keys = set(data) if isinstance(data, dict) else set()
        if isinstance(string_data, dict):
            keys.update(string_data)
        item["data_keys"] = sorted(keys)
    elif doc_kind == "ScaledObject":
        item["scale_target_ref"] = spec.get("scaleTargetRef") or {}
        item["min_replicas"] = spec.get("minReplicaCount")
        item["max_replicas"] = spec.get("maxReplicaCount")
        item["polling_interval"] = spec.get("pollingInterval")
        item["cooldown_period"] = spec.get("cooldownPeriod")
        item["triggers"] = [
            scaled_trigger_summary(trigger)
            for trigger in spec.get("triggers", []) or []
            if isinstance(trigger, dict)
        ]
    elif doc_kind == "ExternalSecret":
        data = spec.get("data")
        item["target_name"] = get_path(spec, "target", "name")
        if isinstance(data, list):
            item["remote_refs"] = [
                {
                    "secretKey": entry.get("secretKey"),
                    "remoteKey": get_path(entry, "remoteRef", "key"),
                }
                for entry in data
                if isinstance(entry, dict)
            ]
    return item


def build_findings(resources: list[dict[str, Any]]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for resource in resources:
        rid = f"{resource.get('kind')}/{resource.get('name')}"
        if resource.get("kind") == "Deployment":
            for container in resource.get("containers", []):
                image = str(container.get("image") or "")
                if image.endswith(":latest") or image == "latest":
                    findings.append({"level": "fail", "resource": rid, "check": "image_tag_latest", "message": image})
                requests = container.get("resources", {}).get("requests", {})
                limits = container.get("resources", {}).get("limits", {})
                if not requests:
                    findings.append({"level": "warn", "resource": rid, "check": "resources_requests_missing", "message": str(container.get("name"))})
                if not limits:
                    findings.append({"level": "warn", "resource": rid, "check": "resources_limits_missing", "message": str(container.get("name"))})
                probes = container.get("probes", {})
                if not probes.get("readiness"):
                    findings.append({"level": "warn", "resource": rid, "check": "readiness_probe_missing", "message": str(container.get("name"))})
                if not probes.get("liveness"):
                    findings.append({"level": "warn", "resource": rid, "check": "liveness_probe_missing", "message": str(container.get("name"))})
        if resource.get("kind") == "PodDisruptionBudget":
            if resource.get("min_available") is not None and resource.get("max_unavailable") is not None:
                findings.append({"level": "fail", "resource": rid, "check": "pdb_conflicting_availability", "message": "minAvailable and maxUnavailable both set"})
    return findings


def resource_identity(doc: dict[str, Any]) -> dict[str, Any]:
    identity = {
        "apiVersion": str(doc.get("apiVersion", "")),
        "kind": kind(doc),
        "name": name(doc),
    }
    ns = namespace(doc)
    if ns:
        identity["namespace"] = ns
    return identity


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize rendered Kubernetes manifest as JSON.")
    parser.add_argument("--manifest", "-m", help="Manifest path; defaults to stdin.")
    parser.add_argument("--helm-output", action="store_true", help="Extract manifest sections from Helm template or dry-run output.")
    parser.add_argument("--include-kind", action="append", default=[], help="Extra kind to include in resources.")
    parser.add_argument("--max-resources", type=int, default=80, help="Maximum projected resources to include in JSON.")
    args = parser.parse_args()

    if args.max_resources < 1:
        parser.error("--max-resources must be positive")

    docs = load_docs(args.manifest, args.helm_output)
    kinds = Counter(kind(doc) for doc in docs)
    resource_index = sorted(
        (resource_identity(doc) for doc in docs),
        key=lambda item: (
            str(item.get("apiVersion", "")),
            str(item.get("kind", "")),
            str(item.get("namespace", "")),
            str(item.get("name", "")),
        ),
    )
    identity_complete = bool(docs) and all(
        item["apiVersion"] and item["kind"] and item["name"] for item in resource_index
    )
    include_kinds = IMPORTANT_KINDS | set(args.include_kind)
    projected_resources = [summarize_doc(doc) for doc in docs if kind(doc) in include_kinds]
    truncated = len(projected_resources) > args.max_resources
    resources = projected_resources[: args.max_resources]
    all_findings = build_findings(projected_resources)
    findings_truncated = len(all_findings) > MAX_FINDINGS
    findings = all_findings[:MAX_FINDINGS]
    complete = identity_complete and not findings_truncated
    result = "fail" if any(f["level"] == "fail" for f in all_findings) else "warning" if all_findings else "pass"

    output = {
        "schema_version": "gitops-summary/v1",
        "type": "manifest_summary",
        "complete": complete,
        "content_complete": complete and not truncated,
        "result": result if complete else "incomplete",
        "input": args.manifest or "stdin",
        "document_count": len(docs),
        "resource_counts": dict(sorted(kinds.items())),
        "resource_index": resource_index,
        "projected_resource_count": len(projected_resources),
        "projected_resources_omitted": len(projected_resources) - len(resources),
        "resources_truncated": truncated,
        "resources": resources,
        "findings_total": len(all_findings),
        "findings_omitted": len(all_findings) - len(findings),
        "findings_truncated": findings_truncated,
        "findings": findings,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
