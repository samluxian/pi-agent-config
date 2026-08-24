#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
summary_script="${script_dir}/render_chart_upgrade_summary.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/chart/templates"

cat >"$tmp/chart/Chart.yaml" <<'YAML'
apiVersion: v2
name: upgrade-summary-fixture
version: 0.1.0
YAML

cat >"$tmp/chart/values.yaml" <<'YAML'
{}
YAML

cat >"$tmp/chart/templates/resources.yaml" <<'YAML'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: demo
  template:
    metadata:
      labels:
        app: demo
    spec:
      serviceAccountName: demo
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution: []
      containers:
        - name: demo
          image: example.invalid/demo:latest
---
apiVersion: v1
kind: Service
metadata:
  name: demo
spec:
  type: ClusterIP
  selector:
    app: demo
  ports:
    - name: http
      port: 80
      targetPort: 8080
      protocol: TCP
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: demo
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: demo
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: demo
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: demo
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
---
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: demo
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: demo
  minReplicaCount: 2
  maxReplicaCount: 5
  pollingInterval: 30
  cooldownPeriod: 300
  triggers:
    - type: cpu
      metadata:
        type: Utilization
        value: "80"
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: demo
  annotations:
    iam.gke.io/gcp-service-account: dev-demo@example-project.iam.gserviceaccount.com
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: demo
data:
  APP_ENV: dev
  LOG_LEVEL: info
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: demo
spec:
  data:
    - secretKey: password
      remoteRef:
        key: dev-demo
YAML

"$summary_script" demo "$tmp/chart" >"$tmp/actual"

cat >"$tmp/expected" <<'OUTPUT'
deployment demo replicas=2 selector={"app":"demo"} podLabels={"app":"demo"} serviceAccount=demo affinity={"podAntiAffinity":{"preferredDuringSchedulingIgnoredDuringExecution":[]}}
service demo type=ClusterIP selector={"app":"demo"} ports=[{"name":"http","port":80,"targetPort":8080,"protocol":"TCP"}]
pdb demo selector={"app":"demo"} minAvailable=1 maxUnavailable=
hpa demo target=Deployment/demo min=2 max=5 metrics=[{"type":"Resource","resource":{"name":"cpu","target":{"type":"Utilization","averageUtilization":80}}}]
scaledObject demo target=Deployment/demo min=2 max=5 polling=30 cooldown=300 triggers=[{"type":"cpu","metadata":{"type":"Utilization","value":"80"}}]
serviceAccount demo gsa=dev-demo@example-project.iam.gserviceaccount.com
configMap demo keys=APP_ENV,LOG_LEVEL
externalSecret demo password -> dev-demo
OUTPUT

diff -u "$tmp/expected" "$tmp/actual"

if "$summary_script" demo "$tmp/missing" >"$tmp/missing.out" 2>"$tmp/missing.err"; then
  echo "ERROR: missing chart path unexpectedly succeeded" >&2
  exit 1
fi
grep -Fx "ERROR: chart path not found: $tmp/missing" "$tmp/missing.err" >/dev/null

echo "render_chart_upgrade_summary_test: PASS"
