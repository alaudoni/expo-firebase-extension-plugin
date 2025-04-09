/**
 * Expo config plugin for One Signal
 * @see https://documentation.Firebase.com/docs/react-native-sdk-setup#step-4-install-for-ios-using-cocoapods-for-ios-apps
 */

import { ConfigPlugin } from '@expo/config-plugins';
import { FirebasePluginProps } from '../types/types';
import { withFirebaseIos } from './withFirebaseIos';
import { validatePluginProps } from '../support/helpers';

const withFirebase: ConfigPlugin<FirebasePluginProps> = (config, props) => {
  // if props are undefined, throw error
  if (!props) {
    throw new Error(
      'You are trying to use the Firebase plugin without any props. Property "mode" is required. Please see https://github.com/Firebase/Firebase-expo-plugin for more info.'
    );
  }

  validatePluginProps(props);

  config = withFirebaseIos(config, props);

  return config;
};

export default withFirebase;
