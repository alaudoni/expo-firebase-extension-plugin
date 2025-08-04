/**
 * Expo config plugin for Firebase (iOS)
 * @see https://rnfirebase.io/messaging/ios-notification-images#main
 */

import {
  ConfigPlugin,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} from "@expo/config-plugins";
import { ExpoConfig } from "@expo/config-types";
import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import getEasManagedCredentialsConfigExtra from "../support/eas/getEasManagedCredentialsConfigExtra";
import { FileManager } from "../support/FileManager";
import { FirebaseLog } from "../support/FirebaseLog";
import {
  DEFAULT_BUNDLE_SHORT_VERSION,
  DEFAULT_BUNDLE_VERSION,
  IPHONEOS_DEPLOYMENT_TARGET,
  NSE_EXT_FILES,
  NSE_SOURCE_FILE,
  NSE_TARGET_NAME,
  TARGETED_DEVICE_FAMILY,
} from "../support/iosConstants";
import NseUpdaterManager from "../support/NseUpdaterManager";
import { updatePodfile } from "../support/updatePodfile";
import { FirebasePluginProps } from "../types/types";

/**
 * Add 'aps-environment' record with current environment to '<project-name>.entitlements' file
 * @see https://rnfirebase.io/messaging/ios-notification-images#main
 */
const withAppEnvironment: ConfigPlugin<FirebasePluginProps> = (
  config,
  FirebaseProps
) => {
  return withEntitlementsPlist(config, (newConfig) => {
    if (FirebaseProps?.mode == null) {
      throw new Error(`
        Missing required "mode" key in your app.json or app.config.js file for "Firebase-expo-plugin".
        "mode" can be either "development" or "production".
        Please see Firebase-expo-plugin's README.md for more details.`);
    }
    newConfig.modResults["aps-environment"] = FirebaseProps.mode;
    return newConfig;
  });
};

/**
 * Add "Background Modes -> Remote notifications" and "App Group" permissions
 * @see https://rnfirebase.io/messaging/ios-notification-images#main
 */
const withRemoteNotificationsPermissions: ConfigPlugin<FirebasePluginProps> = (
  config
) => {
  const BACKGROUND_MODE_KEYS = ["remote-notification"];
  return withInfoPlist(config, (newConfig) => {
    if (!Array.isArray(newConfig.modResults.UIBackgroundModes)) {
      newConfig.modResults.UIBackgroundModes = [];
    }
    for (const key of BACKGROUND_MODE_KEYS) {
      if (!newConfig.modResults.UIBackgroundModes.includes(key)) {
        newConfig.modResults.UIBackgroundModes.push(key);
      }
    }

    return newConfig;
  });
};

/**
 * Add "App Group" permission
 * @see https://rnfirebase.io/messaging/ios-notification-images#main (step 4.4)
 */
const withAppGroupPermissions: ConfigPlugin<FirebasePluginProps> = (config) => {
  const APP_GROUP_KEY = "com.apple.security.application-groups";
  return withEntitlementsPlist(config, (newConfig) => {
    if (!Array.isArray(newConfig.modResults[APP_GROUP_KEY])) {
      newConfig.modResults[APP_GROUP_KEY] = [];
    }
    const modResultsArray = newConfig.modResults[APP_GROUP_KEY] as Array<any>;
    const entitlement = `group.${
      newConfig?.ios?.bundleIdentifier || ""
    }.Firebase`;
    if (modResultsArray.indexOf(entitlement) !== -1) {
      return newConfig;
    }
    modResultsArray.push(entitlement);

    return newConfig;
  });
};

const withEasManagedCredentials: ConfigPlugin<FirebasePluginProps> = (
  config
) => {
  assert(
    config.ios?.bundleIdentifier,
    "Missing 'ios.bundleIdentifier' in app config."
  );
  config.extra = getEasManagedCredentialsConfigExtra(config as ExpoConfig);
  return config;
};

const withFirebasePodfile: ConfigPlugin<FirebasePluginProps> = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      // not awaiting in order to not block main thread
      const iosRoot = path.join(config.modRequest.projectRoot, "ios");
      updatePodfile(iosRoot).catch((err) => {
        FirebaseLog.error(err);
      });

      return config;
    },
  ]);
};

const withFirebaseNSE: ConfigPlugin<FirebasePluginProps> = (config, props) => {
  // support for monorepos where node_modules can be above the project directory.
  const pluginDir = require.resolve(
    "@alaudoni/expo-firebase-extension-plugin/package.json"
  );
  const sourceDir = path.join(
    pluginDir,
    "../build/support/serviceExtensionFiles/"
  );

  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosPath = path.join(config.modRequest.projectRoot, "ios");

      /* COPY OVER EXTENSION FILES */
      fs.mkdirSync(`${iosPath}/${NSE_TARGET_NAME}`, { recursive: true });

      for (let i = 0; i < NSE_EXT_FILES.length; i++) {
        const extFile = NSE_EXT_FILES[i];
        const targetFile = `${iosPath}/${NSE_TARGET_NAME}/${extFile}`;
        await FileManager.copyFile(`${sourceDir}${extFile}`, targetFile);
      }

      // Copy NSE source file either from configuration-provided location, falling back to the default one.
      const sourcePath =
        props.iosNSEFilePath ?? `${sourceDir}${NSE_SOURCE_FILE}`;
      const targetFile = `${iosPath}/${NSE_TARGET_NAME}/${NSE_SOURCE_FILE}`;
      await FileManager.copyFile(`${sourcePath}`, targetFile);

      /* MODIFY COPIED EXTENSION FILES */
      const nseUpdater = new NseUpdaterManager(iosPath);
      await nseUpdater.updateNSEEntitlements(
        `group.${config.ios?.bundleIdentifier}.Firebase`
      );
      await nseUpdater.updateNSEBundleVersion(
        config.ios?.buildNumber ?? DEFAULT_BUNDLE_VERSION
      );
      await nseUpdater.updateNSEBundleShortVersion(
        config?.version ?? DEFAULT_BUNDLE_SHORT_VERSION
      );

      return config;
    },
  ]);
};

const withFirebaseXcodeProject: ConfigPlugin<FirebasePluginProps> = (
  config,
  props
) => {
  return withXcodeProject(config, (newConfig) => {
    const xcodeProject = newConfig.modResults;

    if (!!xcodeProject.pbxTargetByName(NSE_TARGET_NAME)) {
      FirebaseLog.log(
        `${NSE_TARGET_NAME} already exists in project. Skipping...`
      );
      return newConfig;
    }

    // Create new PBXGroup for the extension
    const extGroup = xcodeProject.addPbxGroup(
      [...NSE_EXT_FILES, NSE_SOURCE_FILE],
      NSE_TARGET_NAME,
      NSE_TARGET_NAME
    );

    // Add the new PBXGroup to the top level group. This makes the
    // files / folder appear in the file explorer in Xcode.
    const groups = xcodeProject.hash.project.objects["PBXGroup"];
    Object.keys(groups).forEach(function (key) {
      if (
        typeof groups[key] === "object" &&
        groups[key].name === undefined &&
        groups[key].path === undefined
      ) {
        xcodeProject.addToPbxGroup(extGroup.uuid, key);
      }
    });

    // WORK AROUND for codeProject.addTarget BUG
    // Xcode projects don't contain these if there is only one target
    // An upstream fix should be made to the code referenced in this link:
    //   - https://github.com/apache/cordova-node-xcode/blob/8b98cabc5978359db88dc9ff2d4c015cba40f150/lib/pbxProject.js#L860
    const projObjects = xcodeProject.hash.project.objects;
    projObjects["PBXTargetDependency"] =
      projObjects["PBXTargetDependency"] || {};
    projObjects["PBXContainerItemProxy"] =
      projObjects["PBXTargetDependency"] || {};

    // Add the NSE target
    // This adds PBXTargetDependency and PBXContainerItemProxy for you
    const nseTarget = xcodeProject.addTarget(
      NSE_TARGET_NAME,
      "app_extension",
      NSE_TARGET_NAME,
      `${config.ios?.bundleIdentifier}.${NSE_TARGET_NAME}`
    );

    // Add build phases to the new target
    xcodeProject.addBuildPhase(
      ["NotificationService.m"],
      "PBXSourcesBuildPhase",
      "Sources",
      nseTarget.uuid
    );
    xcodeProject.addBuildPhase(
      [],
      "PBXResourcesBuildPhase",
      "Resources",
      nseTarget.uuid
    );

    xcodeProject.addBuildPhase(
      [],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      nseTarget.uuid
    );

    // Edit the Deployment info of the new Target, only IphoneOS and Targeted Device Family
    // However, can be more
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      if (
        typeof configurations[key].buildSettings !== "undefined" &&
        configurations[key].buildSettings.PRODUCT_NAME == `"${NSE_TARGET_NAME}"`
      ) {
        const buildSettingsObj = configurations[key].buildSettings;
        buildSettingsObj.DEVELOPMENT_TEAM = props?.devTeam;
        buildSettingsObj.IPHONEOS_DEPLOYMENT_TARGET =
          props?.iPhoneDeploymentTarget ?? IPHONEOS_DEPLOYMENT_TARGET;
        buildSettingsObj.TARGETED_DEVICE_FAMILY = TARGETED_DEVICE_FAMILY;
        buildSettingsObj.CODE_SIGN_ENTITLEMENTS = `${NSE_TARGET_NAME}/${NSE_TARGET_NAME}.entitlements`;
        buildSettingsObj.CODE_SIGN_STYLE = "Automatic";
      }
    }

    // Add development teams to both your target and the original project
    xcodeProject.addTargetAttribute(
      "DevelopmentTeam",
      props?.devTeam,
      nseTarget
    );
    xcodeProject.addTargetAttribute("DevelopmentTeam", props?.devTeam);
    return newConfig;
  });
};

export const withFirebaseIos: ConfigPlugin<FirebasePluginProps> = (
  config,
  props
) => {
  config = withAppEnvironment(config, props);
  config = withRemoteNotificationsPermissions(config, props);
  config = withAppGroupPermissions(config, props);
  config = withFirebasePodfile(config, props);
  config = withFirebaseNSE(config, props);
  config = withFirebaseXcodeProject(config, props);
  config = withEasManagedCredentials(config, props);
  return config;
};
