# Private Experience To Synthetic Case

A public synthetic case preserves the technical lesson without preserving the
private record. Create a new case from the abstract mechanism; do not sanitize a
copy of the original.

## Mandatory Transformation

1. Write the mechanism and evidence-layer relationships without source wording.
2. Replace every organization, product, repository, service, branch, commit,
   ticket, person, environment, cluster, namespace, account, project, registry,
   image, route, queue, database, bucket, hostname, address, and timestamp.
3. Replace raw logs, screenshots, payloads, manifests, configuration, and code
   with newly authored minimal artifacts.
4. Preserve relative order with `T+<duration>`. Change distinctive durations,
   quantities, topology, versions, and error wording while keeping the mechanism.
5. Generalize architecture to roles such as gateway, service, worker, and
   datastore unless a public technology is necessary to teach the behavior.
6. Keep the investigation invariant: symptom, evidence, hypotheses, wrong turns,
   falsifier, confirmed cause or open gap, resolution status, and validation.
7. Add this exact notice:

   ```text
   Synthetic educational case — not a sanitized incident record.
   ```

Simple renaming is pseudonymization, not safe publication. A distinctive
combination of timing, scale, topology, wording, and failure signature can still
identify an incident.

## Synthetic Source Packet

Recreate enough evidence to let a reader independently reach the documented
classification:

- a small desired/live configuration fragment;
- bounded fictional status, event, metric, trace, stack, or log excerpts;
- relative timeline and timezone convention;
- healthy or earlier-failure baseline;
- one contradiction or falsifier;
- applied synthetic fix and observed validation, or the decisive missing artifact
  when status is `open`.

Synthetic evidence must be internally consistent and visibly fictional. Never
claim that an external source proves the invented evidence.

## Rejection Conditions

Do not publish when the draft contains or permits reconstruction of:

- a private URL, repository, commit, issue, account, or infrastructure identifier;
- raw or lightly edited private prose, log, code, configuration, or payload;
- credentials, tokens, keys, connection strings, personal/customer data, or
  commercial information;
- exact private dates, unusual quantities, distinctive topology, or recognizable
  combinations of indirect identifiers;
- a claimed resolution that was not validated in the represented case.

If a real secret was ever exposed, remove the draft from publication and require
the system owner to revoke or rotate it. Repository cleanup does not revoke a
credential or remove every clone and cache.

## Review Gate

Run the wiki checker and repository public-safety scanner, then perform a semantic
review that asks:

1. Could an informed insider link this case to one system or incident?
2. Was every artifact newly authored rather than mechanically transformed?
3. Does the synthetic packet preserve the mechanism without preserving identity?
4. Can every conclusion be derived from the included packet or a cited public
   technical source?
5. Does `verified` reflect an applied and behavior-validated resolution?

Technical review does not decide contractual, copyright, privacy, employment, or
trade-secret permission. When that permission is uncertain, do not publish.

## Public References

- NIST SP 800-188, *De-Identifying Government Datasets*:
  https://csrc.nist.gov/pubs/sp/800/188/final
- NISTIR 8053, *De-Identification of Personal Information*:
  https://csrc.nist.gov/pubs/ir/8053/final
- OWASP Logging Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- GitHub, *Removing sensitive data from a repository*:
  https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
