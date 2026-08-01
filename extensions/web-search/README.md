# Web Search

Searches a self-hosted SearXNG JSON endpoint. Set its base URL in the environment:

```bash
export SEARXNG_BASE_URL="https://search.example.internal"
```

The endpoint must support `GET /search?format=json`. No API key or credential
file is used. Search results are untrusted discovery evidence; fetch and verify
primary sources before relying on claims.
