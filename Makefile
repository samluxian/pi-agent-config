.DEFAULT_GOAL := help

WORKSPACE_ROOT ?= $(abspath ..)
INIT_WORKSPACE_SCRIPT := ./scripts/init-workspace.sh

.PHONY: help workspace-init workspace-check workspace-contract-only

help:
	@printf '%s\n' \
		'make workspace-check          Check workspace and Pi-local readiness' \
		'make workspace-init           Reconcile workspace contracts and Pi-local resources' \
		'make workspace-contract-only  Install only AGENTS.md and project-scoped skills' \
		'' \
		'Override the default workspace root with WORKSPACE_ROOT=/path/to/workspace'

workspace-init:
	"$(INIT_WORKSPACE_SCRIPT)" --workspace-root "$(WORKSPACE_ROOT)"

workspace-check:
	"$(INIT_WORKSPACE_SCRIPT)" --workspace-root "$(WORKSPACE_ROOT)" --check

workspace-contract-only:
	"$(INIT_WORKSPACE_SCRIPT)" --workspace-root "$(WORKSPACE_ROOT)" --no-pi-local
