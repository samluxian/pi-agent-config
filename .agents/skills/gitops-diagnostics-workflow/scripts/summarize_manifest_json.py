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
}


def load_docs(path: str | None) -> list[dict[str, Any]]:
    text = sys.stdin.read() if not path or path == "-" else Path(path).read_text()
    docs: list[dict[str, Any]] = []
    for doc in yaml.safe_load_all(text):
        if isinstance(doc, dict):
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


def summarize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    doc_kind = kind(doc)
    item: dict[str, Any] = {
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
        item["data_keys"] = sorted(data) if isinstance(data, dict) else []
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize rendered Kubernetes manifest as JSON.")
    parser.add_argument("--manifest", "-m", help="Manifest path; defaults to stdin.")
    parser.add_argument("--include-kind", action="append", default=[], help="Extra kind to include in resources.")
    parser.add_argument("--max-resources", type=int, default=80, help="Maximum resources to include in JSON.")
    args = parser.parse_args()

    docs = load_docs(args.manifest)
    kinds = Counter(kind(doc) for doc in docs)
    include_kinds = IMPORTANT_KINDS | set(args.include_kind)
    resources = [summarize_doc(doc) for doc in docs if kind(doc) in include_kinds]
    truncated = len(resources) > args.max_resources
    resources = resources[: args.max_resources]
    findings = build_findings(resources)
    result = "fail" if any(f["level"] == "fail" for f in findings) else "warning" if findings else "pass"

    output = {
        "schema_version": "gitops-summary/v1",
        "type": "manifest_summary",
        "result": result,
        "input": args.manifest or "stdin",
        "document_count": len(docs),
        "resource_counts": dict(sorted(kinds.items())),
        "resources_truncated": truncated,
        "resources": resources,
        "findings": findings,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
