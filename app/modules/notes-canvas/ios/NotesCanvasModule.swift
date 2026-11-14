import ExpoModulesCore
import PencilKit
import UIKit
import PDFKit

public final class NotesCanvasModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotesCanvas")
    View(NotesCanvasView.self) {
      Events("onDrawingChange", "onError", "onObjectsChange", "onToolEnd", "onSaved")
      Prop("objects") { (view, value: [[String: Any]]) in view.setObjects(value) }
      Prop("textFormat") { (view, value: [String: Any]) in view.textFormat = value; view.applyTextFormat() }
      Prop("pageWidth") { (view, value: Double) in view.pageSize.width = value; view.setNeedsLayout() }
      Prop("pageHeight") { (view, value: Double) in view.pageSize.height = value; view.setNeedsLayout() }
      Prop("packagePath") { (view, value: String) in view.packageURL = URL(string: value); view.updateBackground(); view.setObjects(view.pageObjects) }
      Prop("background") { (view, value: [String: Any]) in view.pageBackground = value; view.updateBackground() }
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
        case "save":
          view.editingText?.resignFirstResponder()
          view.onSaved(["id": id, "success": view.persist()])
        default: break
        }
        view.notify()
      }
    }
  }
}

final class NotesCanvasView: ExpoView, PKCanvasViewDelegate, UITextViewDelegate, UIContextMenuInteractionDelegate, UIGestureRecognizerDelegate {
  let content = UIView()
  var pageSize = CGSize(width: 595, height: 842)
  let canvas = PKCanvasView()
  let paper = PaperView()
  let backgroundImage = UIImageView()
  var packageURL: URL?
  var pageBackground: [String: Any] = [:]
  private var saveWork: DispatchWorkItem?
  private var loadFailed = false
  let onDrawingChange = EventDispatcher()
  let onError = EventDispatcher()
  let onObjectsChange = EventDispatcher()
  let onToolEnd = EventDispatcher()
  let onSaved = EventDispatcher()
  let objectLayer = UIView()
  var pageObjects: [[String: Any]] = []
  var textFormat: [String: Any] = [:]
  var readOnly = false
  var editingText: UITextView?
  var objectViews: [String: UIView] = [:]
  var toolName = "pen"
  var inkColor = UIColor.label
  var inkWidth = 3.0
  var vectorEraser = false
  var lastCommand = -1
  private var fileURL: URL?
  private var loading = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
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
    let scale = bounds.width / pageSize.width
    content.transform = CGAffineTransform(scaleX: scale, y: scale)
    content.frame.origin = .zero
  }

  func setDrawingPolicy(_ finger: Bool) {
    #if targetEnvironment(simulator) && DEBUG
    canvas.drawingPolicy = .anyInput
    #else
    canvas.drawingPolicy = finger ? .anyInput : .pencilOnly
    #endif
  }

  func updateTool() {
    canvas.isUserInteractionEnabled = !readOnly && toolName != "text" && toolName != "image"
    objectLayer.isUserInteractionEnabled = !readOnly && ["text", "image"].contains(toolName)
    if toolName != "text" { editingText?.resignFirstResponder() }
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

  func load(_ path: String) {
    guard let url = URL(string: path), url != fileURL else { return }
    if fileURL != nil { persist() }
    fileURL = url
    loading = true
    loadFailed = false
    do {
      canvas.drawing = FileManager.default.fileExists(atPath: url.path)
        ? try PKDrawing(data: Data(contentsOf: url)) : PKDrawing()
      canvas.undoManager?.removeAllActions()
    } catch { loadFailed = true; onError(["message": "Не удалось открыть страницу. Закройте документ и попробуйте снова."]) }
    loading = false
    notify()
  }

  @discardableResult func persist() -> Bool {
    guard !loading, !loadFailed, let url = fileURL else { return false }
    do {
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try canvas.drawing.dataRepresentation().write(to: url, options: .atomic)
      return true
    } catch { onError(["message": "Не удалось сохранить страницу. Не закрывайте документ и повторите попытку."]); return false }
  }

  func clearDrawing() {
    replaceDrawing(PKDrawing())
    persist()
  }

  private func replaceDrawing(_ drawing: PKDrawing) {
    let previous = canvas.drawing
    canvas.undoManager?.registerUndo(withTarget: self) { target in target.replaceDrawing(previous); target.persist(); target.notify() }
    canvas.drawing = drawing
  }

  func notify() {
    onDrawingChange(["canUndo": canvas.undoManager?.canUndo ?? false, "canRedo": canvas.undoManager?.canRedo ?? false])
  }
  func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
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
