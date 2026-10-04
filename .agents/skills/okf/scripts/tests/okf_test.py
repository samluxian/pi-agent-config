import importlib.util
from pathlib import Path
import tempfile
import unittest

import yaml

SCRIPT = Path(__file__).resolve().parents[1] / 'okf.py'
spec = importlib.util.spec_from_file_location('okf', SCRIPT)
okf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(okf)


class ValidatorTests(unittest.TestCase):
    def validate(self, text, name='concept.md', extras=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_text(text)
            for path, value in (extras or {}).items():
                (root / path).write_text(value)
            return okf.check(root)

    def test_minimal_unknown_type_and_metadata(self):
        errors, warnings, count = self.validate('---\ntype: Custom Type\nunknown: {nested: [a, b]}\n---\nText')
        self.assertEqual(errors, [])
        self.assertEqual(count, 1)
        self.assertTrue(warnings)

    def test_missing_and_invalid_frontmatter(self):
        for text in ['plain body', '---\ntype: x', '---\ntype: [x]\n---',
                     '---\ntype:\n---', '---\ntype: x\ntype: y\n---',
                     '---\n- x\n---', '---\ntype: [\n---']:
            with self.subTest(text=text):
                self.assertTrue(self.validate(text)[0])

    def test_unhashable_yaml_key_reports_error(self):
        self.assertTrue(self.validate('---\n? [a, b]\n: value\ntype: x\n---')[0])

    def test_optional_metadata(self):
        text = ('---\ntype: tool\nstatus: stable\ntags: [tool]\n'
                'sources: [{id: S1, resource: "https://example.test/docs"}]\n'
                'generated: {by: author, at: "2026-01-01T00:00:00Z"}\n'
                'verified: [{by: reviewer, at: "2026-01-02T00:00:00Z"}]\n'
                'stale_after: "2027-01-01T00:00:00Z"\n---\n')
        self.assertEqual(self.validate(text)[0], [])
        for field in ['status: verified', 'tags: text', 'sources: [{}]',
                      'verified: {}', 'stale_after: "2027-01-01"']:
            self.assertTrue(self.validate(f'---\ntype: x\n{field}\n---')[0])

    def test_reserved_files(self):
        self.assertEqual(self.validate('---\nokf_version: "0.2"\n---\n# Index', 'index.md')[0], [])
        self.assertTrue(self.validate('---\nokf_version: "0.2"\n---', 'nested/index.md')[0])
        self.assertEqual(self.validate('# Log\n## 2026-02-01\nChange\n## 2026-01-01\nChange', 'log.md')[0], [])
        self.assertTrue(self.validate('## 2026-01-01\n## 2026-02-01', 'log.md')[0])
        self.assertTrue(self.validate('## 2026-02-30', 'log.md')[0])
        self.assertTrue(self.validate('# Old index', 'INDEX.md')[0])
        # Uppercase names are ordinary concepts, not reserved indexes.
        self.assertEqual(self.validate('---\ntype: documentation\n---\n# Index', 'INDEX.md')[0], [])

    def test_broken_links_are_warnings(self):
        errors, warnings, _ = self.validate('---\ntype: x\n---\n[Missing](missing.md)\n[Web](https://example.test/)')
        self.assertEqual(errors, [])
        self.assertTrue(any('missing link' in item for item in warnings))
        self.assertFalse(any('example.test' in item for item in warnings))

    def test_bundle_root_links(self):
        errors, warnings, _ = self.validate('---\ntype: x\ndescription: x\n---\n[Root](/index.md)',
                                           extras={'index.md': '# Index'})
        self.assertEqual((errors, warnings), ([], []))

    def test_symlink_not_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'concept.md').symlink_to('/does-not-exist')
            self.assertTrue(okf.check(root)[0])


class MigratedBundleTests(unittest.TestCase):
    def test_entire_bundle(self):
        errors, warnings, concepts = okf.check(okf.DEFAULT_BUNDLE)
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])
        self.assertEqual(concepts, 38)  # 37 original notes plus bundle README.
        self.assertFalse(list(okf.DEFAULT_BUNDLE.rglob('INDEX.md')))

    def test_preserved_evidence_and_mapped_properties(self):
        notes = sorted((okf.DEFAULT_BUNDLE / 'notes').rglob('*.md'))
        notes = [p for p in notes if p.name != 'index.md']
        self.assertEqual(len(notes), 37)
        mapping = {'verified': 'stable', 'open': 'draft', 'draft': 'draft',
                   'superseded': 'deprecated', 'archived': 'deprecated'}
        for path in notes:
            data, body = okf.frontmatter(path.read_text())
            self.assertIn('description', data)
            self.assertIsInstance(data['tags'], list)
            self.assertEqual(data['status'], mapping[data['evidence_status']])
            self.assertNotIn('verified', data)  # Migration must not invent attestation.
            self.assertIn('## Sources', body)
        incident = okf.DEFAULT_BUNDLE / 'notes/incidents/synthetic-startup-restart-causality.md'
        self.assertEqual(okf.frontmatter(incident.read_text())[0]['evidence_status'], 'open')


if __name__ == '__main__':
    unittest.main()
