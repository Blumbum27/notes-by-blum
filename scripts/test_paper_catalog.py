"""Validate the actual bundled template specification without requiring Apple SDKs."""
from pathlib import Path
import json
import math
import unittest

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'Blumbum/Resources/PaperTemplates.json').read_text(encoding='utf-8'))


class PaperCatalogTests(unittest.TestCase):
    def testExpectedLayoutsArePresentOnce(self):
        ids = [layout['id'] for layout in CATALOG['templates']]
        self.assertEqual(CATALOG['version'], 1)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(set(ids), {'cornell', 'daily', 'weekly', 'todo', 'meeting', 'columns', 'music', 'storyboard'})

    def testEveryPrimitiveHasFiniteCoordinatesInsideThePage(self):
        for layout in CATALOG['templates']:
            self.assertTrue(layout['title'])
            self.assertTrue(layout['primitives'])
            for item in layout['primitives']:
                with self.subTest(layout=layout['id'], item=item):
                    self.assertIn(item['kind'], ['line','rect','label','ruled','checklist','staff'])
                    for axis in ['x','y']:
                        self.assertTrue(math.isfinite(item[axis]))
                        self.assertTrue(0 <= item[axis] <= 1)
                    if item['kind'] == 'line':
                        self.assertTrue(0 <= item['toX'] <= 1 and 0 <= item['toY'] <= 1)
                    else:
                        self.assertGreater(item['w'], 0)
                        self.assertGreater(item['h'], 0)
                        self.assertLessEqual(item['x']+item['w'], 1.000001)
                        self.assertLessEqual(item['y']+item['h'], 1.000001)

    def testLabelsHaveTextAndBoundedFonts(self):
        for layout in CATALOG['templates']:
            for item in layout['primitives']:
                if item['kind'] == 'label':
                    self.assertTrue(item['text'].strip())
                    self.assertTrue(6 <= item['fontSize'] <= 24)

    def testLayoutBoxesFitSupportedFormatsAtExtremeMargins(self):
        for w,h in [(595,842),(420,595),(612,792),(600,600)]:
            for width,height in [(w,h),(h,w)]:
                for margin in [16,30,64]:
                    for layout in CATALOG['templates']:
                        for item in layout['primitives']:
                            x=margin+(width-2*margin)*item['x']
                            y=margin+(height-2*margin)*item['y']
                            self.assertGreaterEqual(x, 0)
                            self.assertGreaterEqual(y, 0)
                            self.assertLessEqual(x+(width-2*margin)*item.get('w',0), width+1e-6)
                            self.assertLessEqual(y+(height-2*margin)*item.get('h',0), height+1e-6)

    def testRepeatedPatternsHaveBoundedWork(self):
        for spacing in [16,24,48]:
            for layout in CATALOG['templates']:
                for item in layout['primitives']:
                    height=842*item.get('h',0)
                    if item['kind'] in ['ruled','checklist','staff']:
                        self.assertLess(height/spacing, 64)

    def testImportantTemplateStructuresAreComplete(self):
        by_id={layout['id']:layout for layout in CATALOG['templates']}
        self.assertEqual(sum(p['kind']=='rect' for p in by_id['weekly']['primitives']),7)
        self.assertEqual(sum(p['kind']=='rect' for p in by_id['storyboard']['primitives']),6)
        self.assertTrue(any(p['kind']=='staff' for p in by_id['music']['primitives']))
        self.assertTrue(any(p['kind']=='checklist' for p in by_id['todo']['primitives']))

    def testCatalogIsIncludedAsAnXcodeResource(self):
        project=(ROOT/'NotesByBlum.xcodeproj/project.pbxproj').read_text(encoding='utf-8')
        self.assertIn('Blumbum/Resources/PaperTemplates.json',project)


if __name__=='__main__': unittest.main()
