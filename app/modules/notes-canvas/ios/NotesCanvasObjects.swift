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
      switch object["kind"] as? String {
      case "text", "sticky":
        let text = UITextView(); text.text = object["text"] as? String; text.backgroundColor = .clear
        text.delegate = self; text.isScrollEnabled = false; text.contentInsetAdjustmentBehavior = .never
        if object["kind"] as? String == "sticky" { styleSticky(text, object) } else { format(text, object) }
        view = text
      case "tape":
        view = UIView()
        view.backgroundColor = UIColor.note(object["color"] as? String ?? "#2B2B2B")
        view.layer.cornerRadius = 2
        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(toggleTape(_:))))
      default:
        let image = UIImageView(); image.contentMode = .scaleAspectFit
        if let asset = object["asset"] as? String, let root = packageURL { image.image = UIImage(contentsOfFile: root.appendingPathComponent(asset).path) }
        image.isUserInteractionEnabled = true; view = image
        image.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(resizeObject(_:))))
      }
      view.accessibilityIdentifier = id
      let width = object["width"] as? Double ?? 200, height = object["height"] as? Double ?? 80
      view.bounds = CGRect(x: 0, y: 0, width: width, height: height)
      view.center = CGPoint(x: (object["x"] as? Double ?? 0) + width / 2, y: (object["y"] as? Double ?? 0) + height / 2)
      view.transform = CGAffineTransform(rotationAngle: CGFloat(object["rotation"] as? Double ?? 0) * .pi / 180)
      view.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(moveObject(_:))))
      view.addInteraction(UIContextMenuInteraction(delegate: self))
      objectLayer.addSubview(view); objectViews[id] = view
    }
  }
  private func styleSticky(_ text: UITextView, _ object: [String: Any]) {
    text.backgroundColor = UIColor.note(object["color"] as? String ?? "#FFE98F")
    text.font = .systemFont(ofSize: 20)
    text.textColor = UIColor(white: 0.12, alpha: 1)
    text.textContainerInset = UIEdgeInsets(top: 18, left: 14, bottom: 18, right: 14)
    text.layer.cornerRadius = 6
    text.clipsToBounds = false
    text.layer.shadowColor = UIColor.black.cgColor
    text.layer.shadowOpacity = 0.16
    text.layer.shadowRadius = 8
    text.layer.shadowOffset = CGSize(width: 0, height: 3)
  }
  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    touch.view === objectLayer
  }
  @objc func toggleTape(_ gesture: UITapGestureRecognizer) {
    guard let view = gesture.view else { return }
    UIView.animate(withDuration: 0.22) { view.alpha = view.alpha < 1 ? 1 : 0.14 }
  }
  @objc func pageTapped(_ gesture: UITapGestureRecognizer) {
    if let text = editingText { text.resignFirstResponder(); return }
    let point = gesture.location(in: objectLayer)
    if toolName == "sticky" {
      let side = 200.0
      let x = min(max(0, point.x - side / 2), pageSize.width - side), y = min(max(0, point.y - side / 2), pageSize.height - side)
      let object: [String: Any] = ["id": UUID().uuidString, "kind": "sticky", "text": "", "color": colorValue, "x": Double(x), "y": Double(y), "width": side, "height": side, "rotation": 0.0]
      setObjects(pageObjects + [object])
      emitObjects()
      if let id = object["id"] as? String, let text = objectViews[id] as? UITextView {
        text.transform = text.transform.scaledBy(x: 0.6, y: 0.6); text.alpha = 0
        UIView.animate(withDuration: 0.32, delay: 0, usingSpringWithDamping: 0.78, initialSpringVelocity: 0) { text.transform = .identity; text.alpha = 1 }
        text.becomeFirstResponder()
      }
      return
    }
    guard toolName == "text" else { return }
    var object = textFormat
    let x = min(point.x, pageSize.width - 40)
    object.merge(["id": UUID().uuidString, "kind": "text", "text": "", "x": Double(x), "y": Double(point.y), "width": Double(min(280, pageSize.width - x)), "height": 48.0, "rotation": 0.0]) { _, new in new }
    setObjects(pageObjects + [object])
    if let id = object["id"] as? String, let text = objectViews[id] as? UITextView { draftTextID = id; text.becomeFirstResponder() }
  }
  func addTape(from start: CGPoint, to end: CGPoint) {
    let length = ShapeGeometry.distance(start, end)
    guard length > 12 else { return }
    let center = CGPoint(x: (start.x + end.x) / 2, y: (start.y + end.y) / 2)
    let angle = atan2(end.y - start.y, end.x - start.x) * 180 / .pi
    let object: [String: Any] = ["id": UUID().uuidString, "kind": "tape", "color": colorValue, "x": Double(center.x - length / 2), "y": Double(center.y - inkWidth / 2),
      "width": Double(length), "height": inkWidth, "rotation": Double(angle)]
    setObjects(pageObjects + [object])
    emitObjects()
  }
  private func kind(of view: UIView) -> String? {
    pageObjects.first { $0["id"] as? String == view.accessibilityIdentifier }?["kind"] as? String
  }
  func format(_ text: UITextView, _ object: [String: Any]) {
    let size = object["fontSize"] as? Double ?? 24
    let family = object["fontFamily"] as? String ?? "System"
    var font = family == "Menlo" ? UIFont.monospacedSystemFont(ofSize: size, weight: .regular) : family == "Georgia" ? (UIFont(name: "Georgia", size: size) ?? UIFont.systemFont(ofSize: size)) : UIFont.systemFont(ofSize: size)
    var traits: UIFontDescriptor.SymbolicTraits = []
    if object["bold"] as? Bool == true { traits.insert(.traitBold) }
    if object["italic"] as? Bool == true { traits.insert(.traitItalic) }
    if let descriptor = font.fontDescriptor.withSymbolicTraits(traits) { font = UIFont(descriptor: descriptor, size: size) }
    text.font = font; text.textColor = UIColor.note(object["color"] as? String ?? "#151515")
    var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: text.textColor ?? UIColor.label]
    if object["underline"] as? Bool == true { attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue }
    if object["strikethrough"] as? Bool == true { attributes[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
    let selection = text.selectedRange
    text.attributedText = NSAttributedString(string: text.text ?? "", attributes: attributes)
    text.typingAttributes = attributes
    text.selectedRange = selection
    text.textAlignment = object["alignment"] as? String == "center" ? .center : object["alignment"] as? String == "right" ? .right : .left
  }
  func applyTextFormat() { if let text = editingText, kind(of: text) == "text" { format(text, textFormat); textViewDidChange(text) } }
  func textViewDidBeginEditing(_ textView: UITextView) {
    editingText = textView; objectLayer.capturesBackground = true
    let sticky = kind(of: textView) == "sticky"
    if !sticky { textView.layer.borderColor = UIColor.systemBlue.cgColor; textView.layer.borderWidth = 1 }
    onTextEditingChange(["editing": true, "kind": sticky ? "sticky" : "text"])
  }
  func textViewDidChange(_ textView: UITextView) {
    guard let index = pageObjects.firstIndex(where: { $0["id"] as? String == textView.accessibilityIdentifier }) else { return }
    pageObjects[index]["text"] = textView.text
    guard pageObjects[index]["kind"] as? String == "text" else { return }
    pageObjects[index].merge(textFormat) { _, new in new }
    let size = textView.sizeThatFits(CGSize(width: textView.bounds.width, height: .greatestFiniteMagnitude))
    let height = max(48, size.height)
    textView.center.y += (height - textView.bounds.height) / 2
    textView.bounds.size.height = height
    pageObjects[index]["height"] = Double(height)
  }
  func textViewDidEndEditing(_ textView: UITextView) {
    editingText = nil; textView.layer.borderWidth = 0
    let empty = kind(of: textView) == "text" && textView.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    if empty {
      pageObjects.removeAll { $0["id"] as? String == textView.accessibilityIdentifier }; textView.removeFromSuperview()
    }
    objectLayer.capturesBackground = toolName == "text" || toolName == "sticky"
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
    let size = view.bounds.size
    pageObjects[index].merge(["x": Double(view.center.x - size.width / 2), "y": Double(view.center.y - size.height / 2), "width": Double(size.width), "height": Double(size.height)]) { _, new in new }
    emitObjects()
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
      if let self, let index = self.pageObjects.firstIndex(where: { $0["id"] as? String == view.accessibilityIdentifier }) {
        actions.append(UIAction(title: "Дублировать", image: UIImage(systemName: "plus.square.on.square")) { [weak self] _ in
          guard let self else { return }
          var copy = self.pageObjects[index]
          copy["id"] = UUID().uuidString
          copy["x"] = (copy["x"] as? Double ?? 0) + 24; copy["y"] = (copy["y"] as? Double ?? 0) + 24
          self.setObjects(self.pageObjects + [copy]); self.emitObjects()
        })
      }
      actions.append(UIAction(title: "Удалить", image: UIImage(systemName: "trash"), attributes: .destructive) { _ in
        self?.pageObjects.removeAll { $0["id"] as? String == view.accessibilityIdentifier }; view.removeFromSuperview(); self?.emitObjects()
      })
      return UIMenu(children: actions)
    })
  }
}
