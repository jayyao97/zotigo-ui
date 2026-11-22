import ExpoModulesCore
import UIKit

// Asks iOS for time to finish work the user already started (a send, an
// upload) after the app leaves the foreground. Without it the app is
// suspended within seconds and an in-flight request is cut off.
public class BackgroundTaskModule: Module {
  private var tasks = Set<Int>()
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("ZotigoBackgroundTask")
    Function("begin") { (name: String) -> Int in
      var identifier = UIBackgroundTaskIdentifier.invalid
      identifier = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
        // Out of time: iOS requires the task to end now.
        self?.end(identifier.rawValue)
      }
      if identifier == .invalid { return 0 }
      self.lock.lock()
      self.tasks.insert(identifier.rawValue)
      self.lock.unlock()
      return identifier.rawValue
    }
    Function("end") { (id: Int) in
      self.end(id)
    }
  }

  private func end(_ id: Int) {
    lock.lock()
    let owned = tasks.remove(id) != nil
    lock.unlock()
    if owned { UIApplication.shared.endBackgroundTask(UIBackgroundTaskIdentifier(rawValue: id)) }
  }
}
