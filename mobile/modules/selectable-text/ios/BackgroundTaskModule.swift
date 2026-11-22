import ExpoModulesCore
import UIKit

// Asks iOS for time to finish work the user already started (a send, an
// upload) after the app leaves the foreground. Without it the app is
// suspended within seconds and an in-flight request is cut off.
public class BackgroundTaskModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZotigoBackgroundTask")
    Function("begin") { (name: String) -> Int in
      let task = BackgroundTask()
      task.begin(name)
      return task.id
    }
    Function("end") { (id: Int) in
      BackgroundTask.end(id)
    }
  }
}

// One task, ended exactly once: by JS when the work settles, or by iOS's
// expiry handler when time runs out, whichever comes first. The registry
// is static so a JS reload cannot strand a task that iOS would then kill
// the app for.
private final class BackgroundTask {
  private static var open = [Int: UIBackgroundTaskIdentifier]()
  // Recursive: should iOS ever run the expiry handler inside beginBackgroundTask
  // on the same thread, it must not deadlock.
  private static let lock = NSRecursiveLock()
  private(set) var id = 0

  func begin(_ name: String) {
    var identifier = UIBackgroundTaskIdentifier.invalid
    BackgroundTask.lock.lock()
    identifier = UIApplication.shared.beginBackgroundTask(withName: name) {
      BackgroundTask.end(identifier.rawValue)
    }
    if identifier != .invalid {
      id = identifier.rawValue
      BackgroundTask.open[id] = identifier
    }
    BackgroundTask.lock.unlock()
  }

  static func end(_ id: Int) {
    lock.lock()
    let identifier = open.removeValue(forKey: id)
    lock.unlock()
    if let identifier { UIApplication.shared.endBackgroundTask(identifier) }
  }
}
