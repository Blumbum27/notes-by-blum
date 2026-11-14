const { withXcodeProject } = require('expo/config-plugins');

module.exports = config => withXcodeProject(config, result => {
  const configurations = result.modResults.pbxXCBuildConfigurationSection();
  for (const value of Object.values(configurations)) {
    if (value && typeof value === 'object' && value.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER) {
      value.buildSettings.TARGETED_DEVICE_FAMILY = '2';
    }
  }
  return result;
});
