# @alaudoni/expo-firebase-extension-plugin

> Forked from [abstract-cl/expo-firebase-extension-plugin](https://github.com/abstract-cl/expo-firebase-extension-plugin)

This plugin automates the setup required to use notification images on iOS with [`@react-native-firebase/messaging`](https://rnfirebase.io/messaging/ios-notification-images). See the official guide [here](https://rnfirebase.io/messaging/ios-notification-images).

## Installation

```sh
npm i @alaudoni/expo-firebase-extension-plugin
```

## Setup

1. **Create the file** `./plugins/NotificationService.m` with the following content:

    ```objective-c
    #import "NotificationService.h"
    #import <UserNotifications/UserNotifications.h>
    #import <FirebaseMessaging/FirebaseMessaging.h>

    @interface NotificationService ()

    @property (nonatomic, strong) void (^contentHandler)(UNNotificationContent *contentToDeliver);
    @property (nonatomic, strong) UNMutableNotificationContent *bestAttemptContent;

    @end

    @implementation NotificationService

    - (void)didReceiveNotificationRequest:(UNNotificationRequest *)request
                     withContentHandler:(void (^)(UNNotificationContent *))contentHandler {
        self.contentHandler = contentHandler;
        self.bestAttemptContent = [request.content mutableCopy];

        if (self.bestAttemptContent) {
            [[FIRMessaging extensionHelper] populateNotificationContent:self.bestAttemptContent withContentHandler:contentHandler];
        } else {
            contentHandler(request.content);
        }
    }

    - (void)serviceExtensionTimeWillExpire {
        if (self.contentHandler && self.bestAttemptContent) {
            self.contentHandler(self.bestAttemptContent);
        }
    }

    @end
    ```

2. **Add the plugin to your `app.config.json`:**

    ```json
    {
      "plugins": [
        [
          "@alaudoni/expo-firebase-extension-plugin",
          {
            "mode": "development",
            "iosNSEFilePath": "./plugins/NotificationService.m"
          }
        ]
      ]
    }
    ```

3. **Run Expo commands:**

    ```sh
    npx expo prebuild
    npm run ios
    ```
