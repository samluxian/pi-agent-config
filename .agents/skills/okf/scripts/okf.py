#!/usr/bin/env python3
"""Read-only OKF v0.2 validation. No network or computation execution."""
import argparse
from datetime import date, datetime
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

import yaml

DEFAULT_BUNDLE = Path(__file__).resolve().parents[4] / 'knowledge'


class UniqueLoader(yaml.SafeLoader):
    pass


def mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f'duplicate YAML key: {key}')
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)


def frontmatter(text):
    lines = text.splitlines()
    if not lines or lines[0] != '---':
        raise ValueError('missing YAML frontmatter')
    try:
        end = lines.index('---', 1)
    except ValueError:
        raise ValueError('unterminated YAML frontmatter') from None
    data = yaml.load('\n'.join(lines[1:end]), Loader=UniqueLoader)
    if not isinstance(data, dict):
        raise ValueError('frontmatter must be a mapping')
    return data, '\n'.join(lines[end + 1:])


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def optional_fields(data, errors):
    if 'status' in data and data['status'] not in ('draft', 'stable', 'deprecated'):
        errors.append('status must be draft, stable, or deprecated')
    for key in ('title', 'description', 'resource'):
        if key in data and not nonempty(data[key]):
            errors.append(f'{key} must be a non-empty string')
    if 'tags' in data and (not isinstance(data['tags'], list)
                           or not all(nonempty(tag) for tag in data['tags'])):
        errors.append('tags must be a list of strings')
    if 'sources' in data:
        sources = data['sources']
        if not isinstance(sources, list) or not all(
                isinstance(source, dict) and nonempty(source.get('resource'))
                for source in sources):
            errors.append('sources must be a list of mappings with resource')
    for key in ('generated', 'verified'):
        if key not in data:
            continue
        events = data[key] if key == 'verified' and isinstance(data[key], list) else [data[key]]
        if not events or not all(isinstance(event, dict) and nonempty(event.get('by'))
                                and isinstance(event.get('at'), (str, date, datetime))
                                for event in events):
            errors.append(f'{key} must contain known by and at fields')
    if 'stale_after' in data:
        try:
            value = data['stale_after']
            parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace('Z', '+00:00'))
            if parsed.utcoffset() is None:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            errors.append('stale_after must be an ISO datetime with UTC offset')


def check(bundle):
    bundle = Path(bundle).resolve()
    errors, warnings = [], []
    concepts = 0
    if not bundle.is_dir():
        return ['bundle directory does not exist'], [], 0
    paths = sorted(p for p in bundle.rglob('*.md')
                   if not any(part.startswith('.') for part in p.relative_to(bundle).parts))
    for path in paths:
        label = str(path.relative_to(bundle))
        local = []
        if path.is_symlink() or not path.resolve().is_relative_to(bundle):
            errors.append(f'{label}: symlinks or paths outside bundle are not read')
            continue
        try:
            text = path.read_text(encoding='utf-8')
            body = text
            if path.name == 'index.md':
                if text.startswith('---\n'):
                    data, body = frontmatter(text)
                    if path.parent != bundle:
                        local.append('only the root index may have frontmatter')
                    if 'okf_version' in data and str(data['okf_version']) != '0.2':
                        local.append('unsupported declared okf_version')
            elif path.name == 'log.md':
                dates = re.findall(r'^## (\d{4}-\d{2}-\d{2})\s*$', text, re.M)
                if not dates:
                    local.append('log needs ISO date headings')
                for value in dates:
                    date.fromisoformat(value)
                if dates != sorted(dates, reverse=True):
                    local.append('log dates must be newest first')
            else:
                concepts += 1
                data, body = frontmatter(text)
                if not nonempty(data.get('type')):
                    local.append('type must be a non-empty string')
                optional_fields(data, local)
                if not data.get('description'):
                    warnings.append(f'{label}: consider adding description')
            # Advisory links only; never fetch external resources or read targets.
            prose = re.sub(r'```.*?```|`[^`\n]*`', '', body, flags=re.S)
            for href in re.findall(r'\]\(([^\s)]+)(?:\s+[^)]*)?\)', prose):
                href = href.strip('<>')
                parsed = urlsplit(href)
                if parsed.scheme or parsed.netloc or not parsed.path:
                    continue
                target = ((bundle / unquote(parsed.path).lstrip('/')) if parsed.path.startswith('/')
                          else path.parent / unquote(parsed.path)).resolve()
                if not target.is_relative_to(bundle):
                    warnings.append(f'{label}: link outside bundle: {href}')
                elif not target.exists():
                    warnings.append(f'{label}: missing link: {href}')
        except (ValueError, TypeError, yaml.YAMLError, OSError) as exc:
            local.append(str(exc))
        errors.extend(f'{label}: {message}' for message in local)
    if not (bundle / 'index.md').is_file():
        warnings.append('consider adding a root index.md')
    return errors, warnings, concepts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['check'])
    parser.add_argument('--bundle', type=Path, default=DEFAULT_BUNDLE)
    args = parser.parse_args()
    errors, warnings, concepts = check(args.bundle)
    for message in errors:
        print(f'ERROR: {message}')
    for message in warnings:
        print(f'WARNING: {message}')
    print(f'{concepts} concepts; {len(errors)} errors; {len(warnings)} warnings')
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
