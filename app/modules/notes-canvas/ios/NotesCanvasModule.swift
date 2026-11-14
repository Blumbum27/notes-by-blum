import ExpoModulesCore
import PencilKit
import UIKit
import PDFKit

public final class NotesCanvasModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotesCanvas")
    AsyncFunction("saveAll") { () async -> Bool in
      await NotesCanvasView.saveAll()
    }
    AsyncFunction("clearPage") { (path: String) async -> Bool in
      await NotesCanvasView.clearPage(path)
    }
    View(NotesCanvasView.self) {
      Events("onDrawingChange", "onError", "onObjectsChange", "onToolEnd", "onTextEditingChange", "onVisibleCenter")
      Prop("preview") { (view, value: Bool) in view.preview = value; view.updateTool() }
      Prop("objects") { (view, value: [[String: Any]]) in view.setObjects(value) }
      Prop("textFormat") { (view, value: [String: Any]) in view.textFormat = value; view.applyTextFormat() }
      Prop("pageWidth") { (view, value: Double) in view.pageSize.width = value; view.setNeedsLayout() }
      Prop("pageHeight") { (view, value: Double) in view.pageSize.height = value; view.setNeedsLayout() }
      Prop("rotation") { (view, value: Double) in view.rotation = value; view.setNeedsLayout() }
      Prop("packagePath") { (view, value: String) in
        guard view.packageURL != URL(string: value) else { return }
        view.packageURL = URL(string: value); view.updateBackground(); view.setObjects(view.pageObjects)
      }
      Prop("background") { (view, value: [String: Any]) in
        guard !NSDictionary(dictionary: view.pageBackground).isEqual(to: value) else { return }
        view.pageBackground = value; view.updateBackground()
      }
      Prop("filePath") { (view, value: String) in view.load(value) }
      Prop("tool") { (view, value: String) in view.toolName = value; view.updateTool() }
      Prop("color") { (view, value: String) in view.inkColor = UIColor(hex: value); view.updateTool() }
      Prop("strokeWidth") { (view, value: Double) in view.inkWidth = value; view.updateTool() }
      Prop("eraserMode") { (view, value: String) in view.vectorEraser = value == "vector"; view.updateTool() }
      Prop("pattern") { (view, value: String) in view.paper.pattern = value; view.paper.setNeedsDisplay() }
      Prop("paperColor") { (view, value: String) in view.paper.backgroundColor = UIColor(hex: value) }
      Prop("readOnly") { (view, value: Bool) in view.readOnly = value; view.updateTool() }
      Prop("fingerDrawing") { (view, value: Bool) in view.setDrawingPolicy(value) }
      Prop("command") { (view, value: [String: Any]) in
        guard let id = value["id"] as? Int, id != view.lastCommand else { return }
        view.lastCommand = id
        switch value["action"] as? String {
        case "undo": view.canvas.undoManager?.undo()
        case "redo": view.canvas.undoManager?.redo()
        case "clear": view.clearDrawing()
        case "viewport": view.reportVisibleCenter()
        default: break
        }
        view.notify()
      }
    }
  }
}

final class NotesCanvasView: ExpoView, PKCanvasViewDelegate, UITextViewDelegate, UIContextMenuInteractionDelegate, UIGestureRecognizerDelegate {
  static let instances = NSHashTable<NotesCanvasView>.weakObjects()
  @MainActor static func saveAll() async -> Bool {
    let views = instances.allObjects.filter { !$0.preview && $0.fileURL != nil }
    for view in views { view.editingText?.resignFirstResponder() }
    var success = true
    for view in views {
      if view.loading { await withCheckedContinuation { view.loadWaiters.append($0) } }
      let saved = await withCheckedContinuation { continuation in
        view.persist { continuation.resume(returning: $0) }
      }
      if !saved { success = false }
    }
    return success
  }
  @MainActor static func clearPage(_ path: String) async -> Bool {
    guard let url = URL(string: path) else { return false }
    if let view = instances.allObjects.first(where: { !$0.preview && $0.fileURL == url }) {
      if view.loading { await withCheckedContinuation { view.loadWaiters.append($0) } }
      guard !view.loadFailed else { return false }
      view.clearDrawing(); view.notify()
      return await withCheckedContinuation { continuation in view.persist { continuation.resume(returning: $0) } }
    }
    return await withCheckedContinuation { continuation in
      drawingQueue.async {
        do {
          try PKDrawing().dataRepresentation().write(to: url, options: .atomic)
          continuation.resume(returning: true)
        } catch { continuation.resume(returning: false) }
      }
    }
  }
  var rotation = 0.0
  let content = UIView()
  var pageSize = CGSize(width: 595, height: 842)
  let canvas = PKCanvasView()
  let paper = PaperView()
  let backgroundImage = UIImageView()
  var packageURL: URL?
  var pageBackground: [String: Any] = [:]
  private var saveWork: DispatchWorkItem?
  private var loadFailed = false
  private static let drawingQueue = DispatchQueue(label: "notes.canvas.drawing", qos: .utility)
  private var drawingDirty = false
  private var lastWriteSucceeded = true
  private var lastHistory: (Bool, Bool)?
  let onDrawingChange = EventDispatcher()
  let onError = EventDispatcher()
  let onObjectsChange = EventDispatcher()
  let onToolEnd = EventDispatcher()
  let onTextEditingChange = EventDispatcher()
  let onVisibleCenter = EventDispatcher()
  let objectLayer = ObjectLayer()
  var pageObjects: [[String: Any]] = []
  var textFormat: [String: Any] = [:]
  var readOnly = false
  var editingText: UITextView?
  var draftTextID: String?
  var preview = false
  var objectViews: [String: UIView] = [:]
  var toolName = "pen"
  var inkColor = UIColor.label
  var inkWidth = 3.0
  var vectorEraser = false
  var lastCommand = -1
  private var fileURL: URL?
  private var loading = false
  private var loadWaiters: [CheckedContinuation<Void, Never>] = []

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    Self.instances.add(self)
    addSubview(content)
    content.addSubview(paper)
    content.addSubview(backgroundImage)
    backgroundImage.contentMode = .scaleAspectFit
    content.addSubview(canvas)
    content.addSubview(objectLayer)
    objectLayer.isUserInteractionEnabled = false
    let tap = UITapGestureRecognizer(target: self, action: #selector(pageTapped(_:)))
    tap.delegate = self
    objectLayer.addGestureRecognizer(tap)
    canvas.backgroundColor = .clear
    canvas.isOpaque = false
    canvas.isScrollEnabled = false
    canvas.delegate = self
    setDrawingPolicy(false)
    updateTool()
    NotificationCenter.default.addObserver(self, selector: #selector(saveBeforeBackground), name: UIApplication.willResignActiveNotification, object: nil)
  }

  @objc private func saveBeforeBackground() { editingText?.resignFirstResponder(); persist() }

  override func layoutSubviews() {
    super.layoutSubviews()
    content.transform = .identity
    content.frame = CGRect(origin: .zero, size: pageSize)
    for view in [paper, backgroundImage, canvas, objectLayer] { view.frame = content.bounds }
    canvas.contentSize = pageSize
    let sideways = Int(rotation) % 180 != 0
    let scale = bounds.width / (sideways ? pageSize.height : pageSize.width)
    content.transform = CGAffineTransform(rotationAngle: rotation * .pi / 180).scaledBy(x: scale, y: scale)
    content.center = CGPoint(x: bounds.midX, y: bounds.midY)
  }

  func setDrawingPolicy(_ finger: Bool) {
    canvas.drawingPolicy = finger ? .anyInput : .pencilOnly
  }

  func updateTool() {
    if preview { updatePreview(); return }
    canvas.isUserInteractionEnabled = !loading && !readOnly && toolName != "text" && toolName != "image"
    objectLayer.isUserInteractionEnabled = !readOnly && ["text", "image", "lasso"].contains(toolName)
    objectLayer.capturesBackground = toolName == "text" || editingText != nil
    if !["text", "lasso"].contains(toolName) { editingText?.resignFirstResponder() }
    if toolName == "eraser" {
      canvas.tool = PKEraserTool(vectorEraser ? .vector : .bitmap, width: inkWidth)
    } else if toolName == "lasso" {
      canvas.tool = PKLassoTool()
    } else {
      let type: PKInk.InkType
      switch toolName {
      case "monoline": type = .monoline
      case "fountain": type = .fountainPen
      case "marker": type = .marker
      case "pencil": type = .pencil
      default: type = .pen
      }
      canvas.tool = PKInkingTool(type, color: inkColor, width: inkWidth)
    }
  }

  private func updatePreview() {
    isUserInteractionEnabled = false
    paper.isHidden = true
    let type: PKInk.InkType = toolName == "pencil" ? .pencil : toolName == "marker" ? .marker : toolName == "monoline" ? .monoline : toolName == "fountain" ? .fountainPen : .pen
    let points = (0...80).map { index in
      let t = CGFloat(index) / 80
      let diameter = toolName == "marker" ? max(inkWidth, 12) : toolName == "pencil" ? max(inkWidth, 3) : 3 + sin(t * .pi) * 5
      return PKStrokePoint(location: CGPoint(x: 22 + t * 256, y: 55 + sin(t * .pi * 2) * 25), timeOffset: TimeInterval(t), size: CGSize(width: diameter, height: diameter), opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
    }
    loading = true
    canvas.drawing = PKDrawing(strokes: [PKStroke(ink: PKInk(type, color: inkColor), path: PKStrokePath(controlPoints: points, creationDate: Date()))])
    loading = false
  }

  func load(_ path: String) {
    guard !preview, !path.isEmpty else { return }
    guard let url = URL(string: path), url != fileURL else { return }
    if fileURL != nil { persist() }
    fileURL = url
    loading = true
    drawingDirty = false
    loadFailed = false
    updateTool()
    Self.drawingQueue.async { [self] in
      do {
        let drawing = FileManager.default.fileExists(atPath: url.path) ? try PKDrawing(data: Data(contentsOf: url)) : PKDrawing()
        DispatchQueue.main.async {
          guard self.fileURL == url else { return }
          self.canvas.drawing = drawing
          self.canvas.undoManager?.removeAllActions()
          self.loading = false; self.updateTool(); self.notify()
          let waiters = self.loadWaiters; self.loadWaiters.removeAll(); waiters.forEach { $0.resume() }
        }
      } catch {
        DispatchQueue.main.async {
          guard self.fileURL == url else { return }
          self.loading = false; self.loadFailed = true; self.updateTool()
          let waiters = self.loadWaiters; self.loadWaiters.removeAll(); waiters.forEach { $0.resume() }
          self.onError(["message": "Не удалось открыть страницу. Закройте документ и попробуйте снова."])
        }
      }
    }
  }

  func persist(completion: (@MainActor @Sendable (Bool) -> Void)? = nil) {
    guard !preview, !loading, !loadFailed, let url = fileURL else { completion?(false); return }
    saveWork?.cancel()
    let drawing = canvas.drawing
    let shouldWrite = drawingDirty
    drawingDirty = false
    Self.drawingQueue.async { [self] in
      do {
        if shouldWrite {
          try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
          try drawing.dataRepresentation().write(to: url, options: .atomic)
        }
        if shouldWrite { self.lastWriteSucceeded = true }
        let succeeded = self.lastWriteSucceeded
        DispatchQueue.main.async { completion?(succeeded) }
      } catch {
        self.lastWriteSucceeded = false
        DispatchQueue.main.async {
          if self.fileURL == url { self.drawingDirty = true }
          self.onError(["message": "Не удалось сохранить страницу. Не закрывайте документ и повторите попытку."])
          completion?(false)
        }
      }
    }
  }

  func clearDrawing() {
    replaceDrawing(PKDrawing())
    persist()
  }

  func reportVisibleCenter() {
    var visible = objectLayer.bounds
    var ancestor = superview
    while let parent = ancestor {
      if parent.clipsToBounds || parent is UIWindow { visible = visible.intersection(objectLayer.convert(parent.bounds, from: parent)) }
      ancestor = parent.superview
    }
    let center = visible.isNull || visible.isEmpty ? CGPoint(x: pageSize.width / 2, y: pageSize.height / 2) : CGPoint(x: visible.midX, y: visible.midY)
    onVisibleCenter(["x": center.x, "y": center.y])
  }

  private func replaceDrawing(_ drawing: PKDrawing) {
    let previous = canvas.drawing
    canvas.undoManager?.registerUndo(withTarget: self) { target in target.replaceDrawing(previous); target.persist(); target.notify() }
    canvas.drawing = drawing
  }

  func notify() {
    let undo = canvas.undoManager?.canUndo ?? false, redo = canvas.undoManager?.canRedo ?? false
    guard lastHistory?.0 != undo || lastHistory?.1 != redo else { return }
    lastHistory = (undo, redo)
    onDrawingChange(["canUndo": undo, "canRedo": redo])
  }
  func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
    guard !loading else { return }
    drawingDirty = true
    saveWork?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.persist() }
    saveWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    notify()
  }
  func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) { persist(); notify(); onToolEnd([:]) }
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { editingText?.resignFirstResponder(); saveWork?.cancel(); persist() }
  }
  func updateBackground() {
    backgroundImage.image = nil
    paper.isHidden = pageBackground["kind"] as? String == "pdf" || pageBackground["kind"] as? String == "image"
    guard let asset = pageBackground["asset"] as? String, let root = packageURL else { return }
    let url = root.appendingPathComponent(asset)
    if pageBackground["kind"] as? String == "pdf" {
      if let page = PDFDocument(url: url)?.page(at: pageBackground["page"] as? Int ?? 0) {
        backgroundImage.image = page.thumbnail(of: CGSize(width: 1600, height: 2200), for: .mediaBox)
      } else { onError(["message": "Не удалось открыть фон PDF. Повторно откройте документ."]) }
    } else {
      backgroundImage.image = UIImage(contentsOfFile: url.path)
      if backgroundImage.image == nil { onError(["message": "Не удалось открыть изображение фона."]) }
    }
  }
}

private extension UIColor {
  convenience init(hex: String) {
    let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    self.init(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255,
      blue: CGFloat(value & 255) / 255, alpha: 1)
  }
}
