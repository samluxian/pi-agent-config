# Jib Adapter

Use Jib when a JVM application already builds with Gradle or Maven and the image
can be assembled without a Docker daemon.

## Contract

- Use the registry-producing Jib task, not the Docker-daemon task.
- Keep base-image pull and target-image push authentication separate. Configure
  `from` and `to` credential helpers only where each boundary requires one.
- Prefer the runner's ADC or a Docker-compatible credential helper. Never write a
  service-account key into the repository, CI YAML, image, or build context.
- Preserve the existing application build inputs, JVM settings, entrypoint,
  ports, labels, and base-image policy unless the request changes them.
- Give each isolated environment an explicit target registry/image and immutable
  tag input.

## Evidence Checklist

Read the root build file, convention plugins, settings, wrapper version, CI Jib
job, and any repository-owned helper script. Determine whether configuration is
centralized before adding a local block.

Validate configuration with the repository's Gradle or Maven wrapper when that
can run without remote mutation. A successful configuration check does not prove
registry authorization or push behavior; those require pipeline evidence.

## Public References

- Jib Gradle configuration and build modes:
  https://github.com/GoogleContainerTools/jib/tree/master/jib-gradle-plugin
- Jib 3.1.0 ADC support history:
  https://github.com/GoogleContainerTools/jib/blob/master/jib-gradle-plugin/CHANGELOG.md#310
