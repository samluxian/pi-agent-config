#!/usr/bin/env python3
"""Summarize flex-app render output for migration review.

This script is read-only. It expects a rendered manifest from `helm template`
and reports the chart defaults and runtime-facing resources that are easy to
miss during legacy-to-flex-app migrations.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml


def load_docs(path: str | None) -> list[dict[str, Any]]:
    text = sys.stdin.read() if not path or path == "-" else Path(path).read_text()
    docs = []
    for doc in yaml.safe_load_all(text):
        if isinstance(doc, dict):
            docs.append(doc)
    return docs


def metadata_name(doc: dict[str, Any]) -> str:
    return str(doc.get("metadata", {}).get("name", ""))


def kind(doc: dict[str, Any]) -> str:
    return str(doc.get("kind", ""))


def find_doc(docs: list[dict[str, Any]], target_kind: str, name: str | None = None) -> dict[str, Any] | None:
    matches = [doc for doc in docs if kind(doc) == target_kind]
    if name:
        for doc in matches:
            if metadata_name(doc) == name:
                return doc
    return matches[0] if matches else None


def find_env_configmap(docs: list[dict[str, Any]], release: str) -> dict[str, Any] | None:
    preferred = f"{release}-env"
    doc = find_doc(docs, "ConfigMap", preferred)
    if doc:
        return doc
    for candidate in docs:
        if kind(candidate) == "ConfigMap" and metadata_name(candidate).endswith("-env"):
            return candidate
    return None


def first_container(deploy: dict[str, Any] | None) -> dict[str, Any]:
    if not deploy:
        return {}
    containers = (
        deploy.get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [])
    )
    return containers[0] if containers else {}


def deployment_annotation(deploy: dict[str, Any] | None, key: str) -> str | None:
    if not deploy:
        return None
    return deploy.get("metadata", {}).get("annotations", {}).get(key)


def pod_env_from(container: dict[str, Any]) -> list[str]:
    refs: list[str] = []
    for item in container.get("envFrom", []) or []:
        if "configMapRef" in item:
            refs.append(f"configMap:{item['configMapRef'].get('name', '')}")
        if "secretRef" in item:
            refs.append(f"secret:{item['secretRef'].get('name', '')}")
    return refs


def hpa_summary(hpa: dict[str, Any] | None) -> str:
    if not hpa:
        return "missing"
    spec = hpa.get("spec", {})
    metrics = []
    for metric in spec.get("metrics", []) or []:
        resource = metric.get("resource", {})
        name = resource.get("name")
        value = resource.get("target", {}).get("averageUtilization")
        if name:
            metrics.append(f"{name}={value}")
    metric_text = ", ".join(metrics) if metrics else "no metrics"
    return f"min={spec.get('minReplicas')} max={spec.get('maxReplicas')} metrics={metric_text}"


def pdb_summary(pdb: dict[str, Any] | None) -> str:
    if not pdb:
        return "missing"
    spec = pdb.get("spec", {})
    if "minAvailable" in spec:
        return f"minAvailable={spec.get('minAvailable')}"
    if "maxUnavailable" in spec:
        return f"maxUnavailable={spec.get('maxUnavailable')}"
    return "present without minAvailable/maxUnavailable"


def service_summaries(docs: list[dict[str, Any]]) -> list[str]:
    output = []
    for service in [doc for doc in docs if kind(doc) == "Service"]:
        ports = []
        for port in service.get("spec", {}).get("ports", []) or []:
            ports.append(f"{port.get('name')}:{port.get('port')}->{port.get('targetPort')}")
        output.append(f"{metadata_name(service)} ({', '.join(ports)})")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Check flex-app rendered defaults.")
    parser.add_argument("--manifest", "-m", help="Rendered manifest path; defaults to stdin.")
    parser.add_argument("--release", "-r", required=True, help="Helm release name.")
    args = parser.parse_args()

    docs = load_docs(args.manifest)
    cm = find_env_configmap(docs, args.release)
    deploy = find_doc(docs, "Deployment", args.release) or find_doc(docs, "Deployment")
    container = first_container(deploy)
    sa = find_doc(docs, "ServiceAccount", args.release) or find_doc(docs, "ServiceAccount")
    hpa = find_doc(docs, "HorizontalPodAutoscaler", args.release) or find_doc(docs, "HorizontalPodAutoscaler")
    pdb = find_doc(docs, "PodDisruptionBudget", args.release) or find_doc(docs, "PodDisruptionBudget")

    env_data = cm.get("data", {}) if cm else {}
    warnings: list[str] = []

    if cm and "LOG_LEVEL" not in env_data:
        warnings.append("ConfigMap env is missing LOG_LEVEL; confirm this is intentional.")
    if deployment_annotation(deploy, "reloader.stakater.com/auto") != "true":
        warnings.append("Deployment does not render reloader.stakater.com/auto=true.")
    if not pod_env_from(container):
        warnings.append("Primary container does not render envFrom configMapRef/secretRef.")
    if pdb and "minAvailable" in pdb.get("spec", {}) and "maxUnavailable" in pdb.get("spec", {}):
        warnings.append("PDB renders both minAvailable and maxUnavailable.")

    print("# flex-app Render Check")
    print()
    print(f"- release: {args.release}")
    print(f"- documents: {len(docs)}")
    print(f"- env ConfigMap: {metadata_name(cm) if cm else 'missing'}")
    print(f"- env keys: {', '.join(sorted(env_data)) if env_data else 'none'}")
    print(f"- LOG_LEVEL: {env_data.get('LOG_LEVEL', 'missing') if env_data else 'missing'}")
    print(f"- Deployment reloader annotation: {deployment_annotation(deploy, 'reloader.stakater.com/auto') or 'missing'}")
    print(f"- primary envFrom: {', '.join(pod_env_from(container)) or 'none'}")
    print(f"- ServiceAccount: {metadata_name(sa) if sa else 'missing'}")
    print(f"- HPA: {hpa_summary(hpa)}")
    print(f"- PDB: {pdb_summary(pdb)}")
    services = service_summaries(docs)
    print(f"- Services: {'; '.join(services) if services else 'none'}")
    if warnings:
        print()
        print("## Warnings")
        for warning in warnings:
            print(f"- {warning}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
