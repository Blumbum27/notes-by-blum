"""These portable tests validate release gating, not the native app."""
import copy
import unittest
from release_preflight import problems


class ReleaseToolsTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            'developerName': 'Test publisher', 'supportEmail': 'support@blumbum.dev',
            'privacyPolicyURL': 'https://blumbum.dev/privacy', 'supportURL': 'https://blumbum.dev/support'
        }

    def testConfiguredMetadataPassesWithoutClaimingPagesAreLive(self):
        self.assertEqual(problems(self.config), [])

    def testMissingMetadataBlocksRelease(self):
        self.assertEqual(len(problems({})), 4)

    def testPlaceholdersAndNonPublicURLsBlockRelease(self):
        for url in ['http://blumbum.dev/privacy', 'https://example.com/privacy', 'https://demo.invalid/privacy',
                    'https://127.0.0.1/privacy', 'https://localhost/privacy', 'https://user:password@blumbum.dev/privacy']:
            with self.subTest(url=url):
                config = copy.deepcopy(self.config)
                config['privacyPolicyURL'] = url
                self.assertNotEqual(problems(config), [])

    def testBrokenEmailAndBlankPublisherBlockRelease(self):
        self.config['supportEmail'] = 'not an email'
        self.config['developerName'] = ' '
        self.assertEqual(len(problems(self.config)), 2)


if __name__ == '__main__':
    unittest.main()
