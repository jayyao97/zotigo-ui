import ExpoModulesCore
import UIKit

public class SkillInputModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZotigoSkillInput")
    View(SkillInputView.self) {
      Events("onChange", "onSelection", "onMeasure")
      Prop("value") { (view, value: String) in view.value = value }
      Prop("skills") { (view, names: [String]) in view.skills = names }
      Prop("editable") { (view, editable: Bool) in view.input.isEditable = editable }
      Prop("eventCount") { (view, count: Int) in view.acknowledged = count }
      Prop("caret") { (view, caret: Int) in view.caret = caret }
      OnViewDidUpdateProps { (view: SkillInputView) in view.update() }
    }
  }
}

final class SkillInputView: ExpoView, UITextViewDelegate {
  let onChange = EventDispatcher()
  let onSelection = EventDispatcher()
  let onMeasure = EventDispatcher()
  let input = UITextView()
  private let placeholder = UILabel()
  var value = ""
  var skills: [String] = []
  var acknowledged = 0
  var caret = 0
  private var eventCount = 0
  private var updating = false
  private var lastSelection = NSRange(location: 0, length: 0)
  private var measured: CGFloat = 0
  private let expression = try! NSRegularExpression(pattern: #"\[\$([a-zA-Z0-9][a-zA-Z0-9_.:/-]*)\]"#)
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    input.delegate = self
    input.backgroundColor = .clear
    input.textColor = .white
    input.font = UIFont.preferredFont(forTextStyle: .body)
    input.textContainerInset = UIEdgeInsets(top: 10, left: 14, bottom: 6, right: 14)
    input.textContainer.lineFragmentPadding = 0
    input.accessibilityLabel = "Message"
    placeholder.text = "Ask Zotigo…"
    placeholder.textColor = .secondaryLabel
    placeholder.font = input.font
    input.addSubview(placeholder)
    addSubview(input)
  }
  private func tokens() -> [NSRange] {
    let text = input.text as NSString
    return expression.matches(in: input.text, range: NSRange(location: 0, length: text.length))
      .filter { skills.contains(text.substring(with: $0.range(at: 1))) }.map { $0.range }
  }
  func update() {
    guard eventCount <= acknowledged, input.markedTextRange == nil else { return }
    updating = true
    if input.text != value {
      input.text = value
      input.selectedRange = NSRange(location: min(max(0, caret), (value as NSString).length), length: 0)
    }
    decorate()
    updating = false
    setNeedsLayout()
  }
  private func decorate() {
    let full = NSRange(location: 0, length: (input.text as NSString).length)
    let font = UIFontMetrics.default.scaledFont(for: .systemFont(ofSize: 16))
    input.textStorage.setAttributes([.font: font, .foregroundColor: UIColor.white], range: full)
    for range in tokens() {
      input.textStorage.addAttributes([.backgroundColor: UIColor.systemBlue.withAlphaComponent(0.25), .foregroundColor: UIColor.systemBlue, .font: UIFontMetrics.default.scaledFont(for: .systemFont(ofSize: 16, weight: .medium))], range: range)
    }
    input.typingAttributes = [.font: font, .foregroundColor: UIColor.white]
    placeholder.isHidden = !input.text.isEmpty
  }
  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.width > 0 else { return }
    let natural = ceil(input.sizeThatFits(CGSize(width: bounds.width, height: .greatestFiniteMagnitude)).height)
    let height = min(160, max(44, natural))
    input.isScrollEnabled = natural > 160
    input.frame = CGRect(x: 0, y: 0, width: bounds.width, height: height)
    placeholder.frame = CGRect(x: 14, y: 10, width: bounds.width - 28, height: 26)
    if abs(measured - height) > 0.5 { measured = height; onMeasure(["height": height]) }
  }
  func textViewDidChange(_ textView: UITextView) {
    if input.markedTextRange == nil { updating = true; decorate(); updating = false }
    eventCount += 1
    onChange(["text": input.text ?? "", "caret": input.selectedRange.location + input.selectedRange.length, "eventCount": eventCount])
    setNeedsLayout()
  }
  func textViewDidChangeSelection(_ textView: UITextView) {
    guard !updating, input.markedTextRange == nil else { return }
    var range = input.selectedRange
    for token in tokens() {
      if range.length == 0, range.location > token.location, range.location < NSMaxRange(token) {
        range.location = range.location >= lastSelection.location ? NSMaxRange(token) : token.location
      } else if range.length > 0, NSIntersectionRange(range, token).length > 0 {
        range = NSUnionRange(range, token)
      }
    }
    updating = true; input.selectedRange = range; updating = false
    lastSelection = range
    onSelection(["caret": NSMaxRange(range)])
  }
  func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
    guard input.markedTextRange == nil else { return true }
    var expanded = range
    for token in tokens() where NSIntersectionRange(expanded, token).length > 0 { expanded = NSUnionRange(expanded, token) }
    if expanded != range {
      // Use UITextInput replacement so UIKit retains native undo/redo history.
      guard let start = input.position(from: input.beginningOfDocument, offset: expanded.location),
            let end = input.position(from: start, offset: expanded.length),
            let selection = input.textRange(from: start, to: end) else { return false }
      input.replace(selection, withText: text)
      return false
    }
    return true
  }
}
