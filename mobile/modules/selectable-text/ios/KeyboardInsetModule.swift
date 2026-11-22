import ExpoModulesCore
import UIKit

public class KeyboardInsetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZotigoKeyboardInset")
    View(KeyboardInsetView.self) {
      Events("onInset")
      OnViewDidUpdateProps { (view: KeyboardInsetView) in view.setNeedsLayout() }
    }
  }
}

// A native layout probe, independent of JS keyboard notification ordering.
// Its frame stays equal to the entire screen content, including the obscured area.
final class KeyboardInsetView: ExpoView {
  let onInset = EventDispatcher()
  private let visibleArea = KeyboardVisibleArea()
  private var lastInset: CGFloat = -1

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    keyboardLayoutGuide.followsUndockedKeyboard = false
    visibleArea.translatesAutoresizingMaskIntoConstraints = false
    visibleArea.onLayout = { [weak self] in self?.reportInset() }
    addSubview(visibleArea)
    NSLayoutConstraint.activate([
      visibleArea.topAnchor.constraint(equalTo: topAnchor),
      visibleArea.leadingAnchor.constraint(equalTo: leadingAnchor),
      visibleArea.trailingAnchor.constraint(equalTo: trailingAnchor),
      visibleArea.bottomAnchor.constraint(equalTo: keyboardLayoutGuide.topAnchor),
    ])
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    reportInset()
  }

  private func reportInset() {
    guard window != nil, bounds.height > 0 else { return }
    let overlap = max(0, bounds.height - keyboardLayoutGuide.layoutFrame.minY)
    // With no docked keyboard UIKit's guide covers only the bottom safe area.
    let inset = overlap > safeAreaInsets.bottom + 1 ? overlap : 0
    guard abs(inset - lastInset) > 0.5 else { return }
    lastInset = inset
    onInset(["bottom": inset])
  }
}

private final class KeyboardVisibleArea: UIView {
  var onLayout: (() -> Void)?
  override func layoutSubviews() {
    super.layoutSubviews()
    onLayout?()
  }
}
