# OKF Workflows

## Create And Generate

Choose an atomic concept and a descriptive type. Start from `assets/concept.md`,
keep only useful optional fields, and write the body appropriate to its subject.
Use index links with short descriptions for progressive disclosure. Update the
relevant directory/topic index when requested concept edits affect navigation.
Do not make index generation or logging an automatic background task.

## Enrich

Identify what is missing and what evidence supports the addition. Add schema
tables for data assets, request/response or usage examples for APIs/tools, and
cross-links where they clarify meaning. Optional `sources` entries must use
actual public source URIs. Existing body citations need not be moved. Never
invent an asset URI, schema, example outcome, verification event, or author/date.
Preserve metadata not understood by the workflow. Format validation does not
prove enriched claims. Review the diff for semantic changes.

## Convert

- Markdown/wiki: keep bodies and citations, map known properties, rename MOC or
  listing documents to `index.md`, and repair links. Preserve unknown fields.
- Obsidian: translate wikilinks and vault-specific syntax into Markdown links;
  retain useful tags and hierarchy. Do not remove the user's vault configuration
  just to adopt OKF; it is not part of the concept format.
- Notion: map exported properties, repair UUID-based filenames/links, and preserve
  hierarchy. Ask when the intended type is unknown.
- CSV/spreadsheets: one concept per intended row, mapped frontmatter properties,
  remaining useful columns in the body; omit empty optional values.

Inspect only authorized, non-secret source files. Conversion does not authorize
source ingestion from other repositories or services. Preserve evidence gaps
and never turn a lifecycle status into human verification. Validate the result
and compare concept counts, retained fields, and bodies with the source.

## Serve

OKF does not prescribe a server or transport. Local consumers can already read
the Markdown directory. Prepare serving only for a user-selected consumer with
a known, documented adapter contract. Validate the bundle first; establish which
files would be exposed, the reader/write boundary, and public-safety readiness.

The official skill mentions Google Cloud Knowledge Catalog, KCMD pull/push and
MCP integrations. They are optional upstream examples, not installed features of
this repository. Do not infer cloud projects, catalog identifiers, endpoints, or
credentials. Do not install an adapter, start a listener, configure MCP, upload,
publish, or mutate a remote service as part of local knowledge maintenance.
GCP and Git remotes remain inspection-only under the workspace contract, even
when the user invokes this operation. Report the missing consumer configuration
or prohibited action rather than claiming the bundle has been served.

## References

- [Official OKF skill](https://okf.md/skill/)
- [OKF specification](https://okf.md/spec/)
- [Upstream conversion guide](https://github.com/fabricioctelles/skills/blob/main/skills/okf-open-knowledge-format/references/conversion.md)

These are upstream references, not executable dependencies. No upstream skill
text has been vendored; this adaptation follows the documented format/workflows.
