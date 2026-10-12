import ExpoModulesCore
import UIKit

struct TextRun: Record {
  @Field var text: String = ""
  @Field var bold: Bool = false
  @Field var italic: Bool = false
  @Field var code: Bool = false
  @Field var strike: Bool = false
  @Field var link: String = ""
}

public class SelectableTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZotigoSelectableText")
    View(SelectableTextView.self) {
      Events("onMeasure", "onAction", "onLink", "onSelecting")
      Prop("runs") { (view, runs: [TextRun]) in view.runs = runs }
      Prop("fontSize") { (view, size: Double) in view.fontSize = size }
      Prop("lineHeight") { (view, height: Double) in view.lineHeight = height }
      Prop("textColor") { (view, color: UIColor) in view.textColor = color }
      Prop("linkColor") { (view, color: UIColor) in view.linkColor = color }
      OnViewDidUpdateProps { (view: SelectableTextView) in view.updateText() }
    }
  }
}

final class SelectableTextView: ExpoView, UITextViewDelegate {
  let onMeasure = EventDispatcher()
  let onAction = EventDispatcher()
  let onLink = EventDispatcher()
  let onSelecting = EventDispatcher()
  var runs: [TextRun] = []
  var fontSize = 16.0
  var lineHeight = 26.0
  var textColor = UIColor.white
  var linkColor = UIColor.systemBlue
  private let textView = UITextView()
  private var measuredHeight: CGFloat = 0
  private var pendingText: NSAttributedString?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    textView.delegate = self
    textView.isEditable = false
    textView.isSelectable = true
    textView.isScrollEnabled = false
    textView.backgroundColor = .clear
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    textView.adjustsFontForContentSizeCategory = true
    addSubview(textView)
  }

  func updateText() {
    let result = NSMutableAttributedString(string: "")
    let paragraph = NSMutableParagraphStyle()
    let scaledFontSize = UIFontMetrics.default.scaledValue(for: CGFloat(fontSize))
    paragraph.minimumLineHeight = UIFontMetrics.default.scaledValue(for: CGFloat(lineHeight))
    for run in runs {
      let base = run.code ? UIFont.monospacedSystemFont(ofSize: scaledFontSize * 0.875, weight: .regular) : UIFont.systemFont(ofSize: scaledFontSize)
      var traits: UIFontDescriptor.SymbolicTraits = []
      if run.bold { traits.insert(.traitBold) }
      if run.italic { traits.insert(.traitItalic) }
      let font = base.fontDescriptor.withSymbolicTraits(traits).map { UIFont(descriptor: $0, size: base.pointSize) } ?? base
      var attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: textColor, .paragraphStyle: paragraph]
      if run.code { attrs[.backgroundColor] = UIColor(white: 0.18, alpha: 1) }
      if run.strike { attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
      if !run.link.isEmpty { attrs[.link] = run.link }
      result.append(NSAttributedString(string: run.text, attributes: attrs))
    }
    textView.linkTextAttributes = [.foregroundColor: linkColor, .underlineStyle: NSUnderlineStyle.single.rawValue]
    // Do not replace the attributed buffer under a user's active selection.
    if textView.isFirstResponder && textView.selectedRange.length > 0 {
      pendingText = result
      return
    }
    pendingText = nil
    if !textView.attributedText.isEqual(to: result) { textView.attributedText = result }
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.width > 0 else { return }
    let height = ceil(textView.sizeThatFits(CGSize(width: bounds.width, height: .greatestFiniteMagnitude)).height)
    textView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: height)
    if abs(height - measuredHeight) > 0.5 {
      measuredHeight = height
      onMeasure(["height": height])
    }
  }

  func textViewDidChangeSelection(_ textView: UITextView) {
    if textView.isFirstResponder && textView.selectedRange.length > 0 { onSelecting([:]) }
    else if let pending = pendingText {
      pendingText = nil
      textView.attributedText = pending
      setNeedsLayout()
    }
  }

  func textViewDidEndEditing(_ textView: UITextView) {
    if let pending = pendingText {
      pendingText = nil
      textView.attributedText = pending
      setNeedsLayout()
    }
  }

  func textView(_ textView: UITextView, shouldInteractWith URL: URL, in characterRange: NSRange, interaction: UITextItemInteraction) -> Bool {
    onLink(["url": URL.absoluteString])
    return false
  }

  func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
    let source = textView.text as NSString
    guard range.length > 0, NSMaxRange(range) <= source.length else { return nil }
    let text = source.substring(with: range)
    let actions = [
      UIAction(title: "Add to conversation", image: UIImage(systemName: "text.bubble")) { [weak self] _ in self?.send("reference", text: text) },
      UIAction(title: "Copy", image: UIImage(systemName: "doc.on.doc")) { _ in UIPasteboard.general.string = text },
      UIAction(title: "Translate", image: UIImage(systemName: "character.bubble")) { [weak self] _ in self?.send("translate", text: text) }
    ]
    if text.utf16.count > 8000 { actions[0].attributes = .disabled; actions[2].attributes = .disabled }
    return UIMenu(children: actions)
  }

  private func send(_ action: String, text: String) {
    onAction(["action": action, "text": text])
    textView.selectedRange = NSRange(location: 0, length: 0)
    textView.resignFirstResponder()
  }
}
