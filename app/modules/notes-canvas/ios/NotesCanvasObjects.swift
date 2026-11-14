import UIKit

final class ObjectLayer: UIView {
  var capturesBackground = false
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let hit = super.hitTest(point, with: event)
    return hit === self && !capturesBackground ? nil : hit
  }
}

extension NotesCanvasView {
  func setObjects(_ objects: [[String: Any]]) {
    guard editingText == nil else { return }
    pageObjects = objects
    for view in objectViews.values { view.removeFromSuperview() }
    objectViews.removeAll()
    for object in objects {
      guard let id = object["id"] as? String else { continue }
      let view: UIView
      if object["kind"] as? String == "text" {
        let text = UITextView(); text.text = object["text"] as? String; text.backgroundColor = .clear
        text.delegate = self; text.isScrollEnabled = false; text.contentInsetAdjustmentBehavior = .never; format(text, object); view = text
      } else {
        let image = UIImageView(); image.contentMode = .scaleAspectFit
        if let asset = object["asset"] as? String, let root = packageURL { image.image = UIImage(contentsOfFile: root.appendingPathComponent(asset).path) }
        image.isUserInteractionEnabled = true; view = image
        image.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(resizeObject(_:))))
      }
      view.accessibilityIdentifier = id
      view.frame = CGRect(x: object["x"] as? Double ?? 0, y: object["y"] as? Double ?? 0, width: object["width"] as? Double ?? 200, height: object["height"] as? Double ?? 80)
      view.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(moveObject(_:))))
      view.addInteraction(UIContextMenuInteraction(delegate: self))
      objectLayer.addSubview(view); objectViews[id] = view
    }
  }
  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    touch.view === objectLayer
  }
  @objc func pageTapped(_ gesture: UITapGestureRecognizer) {
    if let text = editingText { text.resignFirstResponder(); return }
    guard toolName == "text" else { return }
    let point = gesture.location(in: objectLayer)
    var object = textFormat
    let x = min(point.x, pageSize.width - 40)
    object.merge(["id": UUID().uuidString, "kind": "text", "text": "", "x": Double(x), "y": Double(point.y), "width": Double(min(280, pageSize.width - x)), "height": 48.0, "rotation": 0.0]) { _, new in new }
    setObjects(pageObjects + [object])
    if let id = object["id"] as? String, let text = objectViews[id] as? UITextView { draftTextID = id; text.becomeFirstResponder() }
  }
  func format(_ text: UITextView, _ object: [String: Any]) {
    let size = object["fontSize"] as? Double ?? 24
    let family = object["fontFamily"] as? String ?? "System"
    var font = family == "Menlo" ? UIFont.monospacedSystemFont(ofSize: size, weight: .regular) : family == "Georgia" ? (UIFont(name: "Georgia", size: size) ?? UIFont.systemFont(ofSize: size)) : UIFont.systemFont(ofSize: size)
    var traits: UIFontDescriptor.SymbolicTraits = []
    if object["bold"] as? Bool == true { traits.insert(.traitBold) }
    if object["italic"] as? Bool == true { traits.insert(.traitItalic) }
    if let descriptor = font.fontDescriptor.withSymbolicTraits(traits) { font = UIFont(descriptor: descriptor, size: size) }
    text.font = font; text.textColor = UIColor(noteHex: object["color"] as? String ?? "#151515")
    var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: text.textColor ?? UIColor.label]
    if object["underline"] as? Bool == true { attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue }
    if object["strikethrough"] as? Bool == true { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
    let selection = text.selectedRange
    text.attributedText = NSAttributedString(string: text.text ?? "", attributes: attributes)
    text.typingAttributes = attributes
    text.selectedRange = selection
    text.textAlignment = object["alignment"] as? String == "center" ? .center : object["alignment"] as? String == "right" ? .right : .left
  }
  func applyTextFormat() { if let text = editingText { format(text, textFormat); textViewDidChange(text) } }
  func textViewDidBeginEditing(_ textView: UITextView) {
    editingText = textView; objectLayer.capturesBackground = true
    textView.layer.borderColor = UIColor.systemBlue.cgColor; textView.layer.borderWidth = 1
    onTextEditingChange(["editing": true])
  }
  func textViewDidChange(_ textView: UITextView) {
    guard let index = pageObjects.firstIndex(where: { $0["id"] as? String == textView.accessibilityIdentifier }) else { return }
    pageObjects[index].merge(textFormat) { _, new in new }; pageObjects[index]["text"] = textView.text
    let size = textView.sizeThatFits(CGSize(width: textView.bounds.width, height: .greatestFiniteMagnitude))
    textView.frame.size.height = max(48, size.height)
    pageObjects[index]["height"] = Double(textView.frame.height)
  }
  func textViewDidEndEditing(_ textView: UITextView) {
    editingText = nil; textView.layer.borderWidth = 0
    let empty = textView.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    if empty {
      pageObjects.removeAll { $0["id"] as? String == textView.accessibilityIdentifier }; textView.removeFromSuperview()
    }
    objectLayer.capturesBackground = toolName == "text"
    onTextEditingChange(["editing": false])
    if !empty || draftTextID != textView.accessibilityIdentifier { emitObjects() }
    draftTextID = nil
  }
  @objc func moveObject(_ gesture: UIPanGestureRecognizer) {
    guard let view = gesture.view else { return }
    let delta = gesture.translation(in: objectLayer); view.center.x += delta.x; view.center.y += delta.y
    gesture.setTranslation(.zero, in: objectLayer)
    if gesture.state == .ended { saveGeometry(view) }
  }
  @objc func resizeObject(_ gesture: UIPinchGestureRecognizer) {
    guard let view = gesture.view else { return }
    view.bounds.size.width *= gesture.scale; view.bounds.size.height *= gesture.scale; gesture.scale = 1
    if gesture.state == .ended { saveGeometry(view) }
  }
  func saveGeometry(_ view: UIView) {
    guard let index = pageObjects.firstIndex(where: { $0["id"] as? String == view.accessibilityIdentifier }) else { return }
    pageObjects[index].merge(["x": Double(view.frame.minX), "y": Double(view.frame.minY), "width": Double(view.frame.width), "height": Double(view.frame.height)]) { _, new in new }; emitObjects()
  }
  func emitObjects() { onObjectsChange(["objects": pageObjects]) }
  func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
    guard !readOnly, let view = interaction.view else { return nil }
    return UIContextMenuConfiguration(actionProvider: { [weak self] _ in
      var actions: [UIAction] = []
      if view is UIImageView {
        for (title, factor) in [("Увеличить", 1.2), ("Уменьшить", 1 / 1.2)] {
          actions.append(UIAction(title: title, image: UIImage(systemName: factor > 1 ? "plus.magnifyingglass" : "minus.magnifyingglass")) { _ in
            view.bounds.size.width *= factor; view.bounds.size.height *= factor; self?.saveGeometry(view)
          })
        }
      }
      actions.append(UIAction(title: "Удалить", image: UIImage(systemName: "trash"), attributes: .destructive) { _ in
        self?.pageObjects.removeAll { $0["id"] as? String == view.accessibilityIdentifier }; view.removeFromSuperview(); self?.emitObjects()
      })
      return UIMenu(children: actions)
    })
  }
}

private extension UIColor {
  convenience init(noteHex: String) {
    let value = UInt64(noteHex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    self.init(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
  }
}
