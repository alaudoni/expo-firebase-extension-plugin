export class FirebaseLog {
  static log(str: string) {
    console.log(`\tfirebase-expo-extension-plugin: ${str}`)
  }

  static error(str: string) {
    console.error(`\tirebase-expo-extension-plugin: ${str}`)
  }
}
