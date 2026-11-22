import ExpoModulesCore
import Foundation

// System screens shown by the app (camera, photo picker, file picker,
// permission prompts) use the app's preferred language, not the language
// chosen in Zotigo's settings. Writing the per-app preference makes them
// match; iOS reads it at launch, so it applies from the next launch.
public class AppLanguageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZotigoAppLanguage")
    Function("setPreferred") { (language: String) in
      UserDefaults.standard.set([language], forKey: "AppleLanguages")
    }
  }
}
