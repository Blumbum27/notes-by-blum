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
      Prop("color") { (view, value: String) in view.colorValue = value; view.inkColor = UIColor.note(value); view.updateTool() }
      Prop("shapeKind") { (view, value: String) in view.shapeKind = value; view.updateTool() }
      Prop("laserMode") { (view, value: String) in view.laserDot = value == "dot" }
      Prop("ruler") { (view, value: Bool) in view.canvas.isRulerActive = value }
      Prop("penOptions") { (view, value: [String: Any]) in
        view.pressure = value["pressure"] as? Double ?? 1
        view.stabilization = value["stabilization"] as? Double ?? 0
        view.holdToSnap = value["holdToSnap"] as? Bool ?? true
      }
      Prop("strokeWidth") { (view, value: Double) in view.inkWidth = value; view.updateTool() }
      Prop("eraserMode") { (view, value: String) in view.vectorEraser = value == "vector"; view.updateTool() }
      Prop("pattern") { (view, value: String) in view.paper.pattern = value; view.paper.setNeedsDisplay() }
      Prop("paperColor") { (view, value: String) in view.paper.backgroundColor = UIColor.note(value) }
      Prop("readOnly") { (view, value: Bool) in view.readOnly = value; view.updateTool() }
      Prop("fingerDrawing") { (view, value: Bool) in view.setDrawingPolicy(value) }
      Prop("command") { (view, value: [String: Any]) in
        guard let id = value["id"] as? Int, id != view.lastCommand else { return }
        view.lastCommand = id
        switch value["action"] as? String {
        case "undo": view.canvas.undoManager?.undo()
        case "redo": view.canvas.undoManager?.redo()
        case "clear": view.clearDrawing()
        case "erase": view.erase(value["inks"] as? [String] ?? [])
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
  var shapeKind = "freeform"
  var laserDot = true
  var pressure = 1.0
  var stabilization = 0.0
  var holdToSnap = true
  var colorValue = "#151515"
  var strokeCount = 0
  let overlay = ToolOverlay()
  lazy var overlayPan = UIPanGestureRecognizer(target: self, action: #selector(overlayDragged(_:)))
  var dragStart = CGPoint.zero
  var laserTrail: [CGPoint] = []
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
    content.addSubview(overlay)
    overlayPan.maximumNumberOfTouches = 1
    overlay.addGestureRecognizer(overlayPan)
    setDrawingPolicy(false)
    updateTool()
    NotificationCenter.default.addObserver(self, selector: #selector(saveBeforeBackground), name: UIApplication.willResignActiveNotification, object: nil)
  }

  @objc private func saveBeforeBackground() { editingText?.resignFirstResponder(); persist() }

  override func layoutSubviews() {
    super.layoutSubviews()
    content.transform = .identity
    content.frame = CGRect(origin: .zero, size: pageSize)
    for view in [paper, backgroundImage, canvas, objectLayer, overlay] { view.frame = content.bounds }
    canvas.contentSize = pageSize
    let sideways = Int(rotation) % 180 != 0
    let scale = bounds.width / (sideways ? pageSize.height : pageSize.width)
    content.transform = CGAffineTransform(rotationAngle: rotation * .pi / 180).scaledBy(x: scale, y: scale)
    content.center = CGPoint(x: bounds.midX, y: bounds.midY)
  }

  func setDrawingPolicy(_ finger: Bool) {
    canvas.drawingPolicy = finger ? .anyInput : .pencilOnly
    overlayPan.allowedTouchTypes = (finger ? [UITouch.TouchType.direct, .pencil] : [.pencil]).map { NSNumber(value: $0.rawValue) }
  }

  var overlayTool: Bool { toolName == "tape" || toolName == "laser" || (toolName == "shape" && shapeKind != "freeform") }

  func updateTool() {
    if preview { updatePreview(); return }
    let objectTools = ["text", "image", "lasso", "sticky", "tape"]
    canvas.isUserInteractionEnabled = !loading && !readOnly && !overlayTool && !["text", "image", "sticky"].contains(toolName)
    objectLayer.isUserInteractionEnabled = !readOnly && objectTools.contains(toolName)
    objectLayer.capturesBackground = toolName == "text" || toolName == "sticky" || editingText != nil
    overlay.isUserInteractionEnabled = !loading && !readOnly && overlayTool
    if !["text", "lasso", "sticky"].contains(toolName) { editingText?.resignFirstResponder() }
    if toolName == "eraser" {
      canvas.tool = PKEraserTool(vectorEraser ? .vector : .bitmap, width: inkWidth)
    } else if toolName == "lasso" {
      canvas.tool = PKLassoTool()
    } else {
      canvas.tool = PKInkingTool(inkType(toolName), color: inkColor, width: inkWidth)
    }
  }

  func inkType(_ name: String) -> PKInk.InkType {
    switch name {
    case "monoline", "shape", "drawShape": return .monoline
    case "fountain": return .fountainPen
    case "marker": return .marker
    case "pencil": return .pencil
    default: return .pen
    }
  }

  private func updatePreview() {
    isUserInteractionEnabled = false
    paper.isHidden = true
    let type = inkType(toolName)
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

  func replaceDrawing(_ drawing: PKDrawing) {
    let previous = canvas.drawing
    canvas.undoManager?.registerUndo(withTarget: self) { target in target.replaceDrawing(previous); target.persist(); target.notify() }
    strokeCount = drawing.strokes.count
    canvas.drawing = drawing
  }

  func erase(_ inks: [String]) {
    let types = Set(inks.flatMap { name -> [PKInk.InkType] in
      switch name {
      case "pen": return [.pen, .monoline, .fountainPen]
      case "pencil": return [.pencil]
      case "marker": return [.marker]
      default: return []
      }
    })
    var drawing = canvas.drawing
    drawing.strokes.removeAll { types.contains($0.ink.inkType) }
    guard drawing.strokes.count != canvas.drawing.strokes.count else { return }
    replaceDrawing(drawing)
    persist()
  }

  /// Заменяет только что нарисованный штрих: фигура для «Фигур» и Draw Shape, сглаживание и нажим для остальных перьев.
  private func adjustedStroke(_ stroke: PKStroke) -> PKStroke? {
    let points = stroke.path.map { $0.location.applying(stroke.transform) }
    let width = stroke.path.reduce(0) { $0 + $1.size.width } / CGFloat(max(stroke.path.count, 1))
    if toolName == "shape" || toolName == "drawShape" {
      if toolName == "drawShape", holdToSnap, let last = stroke.path.last {
        let held = Date().timeIntervalSince(stroke.path.creationDate.addingTimeInterval(last.timeOffset))
        guard held > 0.45 else { return nil }
      }
      return ShapeGeometry.recognize(points).map { ShapeGeometry.stroke($0, ink: stroke.ink, width: width) }
    }
    guard stabilization > 0 || pressure < 1 else { return nil }
    return ShapeGeometry.adjust(stroke, stabilization: stabilization, pressure: pressure)
  }

  @objc func overlayDragged(_ gesture: UIPanGestureRecognizer) {
    let point = gesture.location(in: overlay)
    switch gesture.state {
    case .began:
      dragStart = point; laserTrail = [point]; overlay.clear()
      if toolName == "laser" { overlay.laser(laserTrail, dot: laserDot) }
    case .changed:
      if toolName == "laser" {
        laserTrail.append(point); if laserTrail.count > 40 { laserTrail.removeFirst() }
        overlay.laser(laserDot ? [point] : laserTrail, dot: laserDot)
      } else if toolName == "tape" {
        overlay.preview.lineCap = .butt
        overlay.showPath([dragStart, point], color: UIColor.note(colorValue).withAlphaComponent(0.85), width: inkWidth)
      } else {
        overlay.preview.lineCap = .round
        overlay.showPath(ShapeGeometry.drag(shapeKind, from: dragStart, to: point), color: inkColor, width: inkWidth * ShapeGeometry.inkPointScale)
      }
    case .ended:
      if toolName == "laser" { overlay.fadeOut(); return }
      overlay.clear()
      if toolName == "tape" { addTape(from: dragStart, to: point); return }
      guard ShapeGeometry.distance(dragStart, point) > 8 else { return }
      var drawing = canvas.drawing
      drawing.strokes.append(ShapeGeometry.stroke(ShapeGeometry.drag(shapeKind, from: dragStart, to: point), ink: PKInk(.monoline, color: inkColor), width: inkWidth * ShapeGeometry.inkPointScale))
      replaceDrawing(drawing); persist(); notify()
    default:
      if toolName == "laser" { overlay.fadeOut() } else { overlay.clear() }
    }
  }

  func notify() {
    let undo = canvas.undoManager?.canUndo ?? false, redo = canvas.undoManager?.canRedo ?? false
    guard lastHistory?.0 != undo || lastHistory?.1 != redo else { return }
    lastHistory = (undo, redo)
    onDrawingChange(["canUndo": undo, "canRedo": redo])
  }
  func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
    let strokes = canvas.drawing.strokes
    if !loading, strokes.count == strokeCount + 1, canvas.tool is PKInkingTool, let last = strokes.last, let adjusted = adjustedStroke(last) {
      var drawing = canvas.drawing
      drawing.strokes[drawing.strokes.count - 1] = adjusted
      strokeCount = drawing.strokes.count
      canvas.drawing = drawing
    }
    strokeCount = canvas.drawing.strokes.count
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
