import ExpoModulesCore
import PencilKit
import UIKit

public final class NotesCanvasModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotesCanvas")
    View(NotesCanvasView.self) {
      Events("onDrawingChange", "onError")
      Prop("filePath") { (view, value: String) in view.load(value) }
      Prop("tool") { (view, value: String) in view.toolName = value; view.updateTool() }
      Prop("color") { (view, value: String) in view.inkColor = UIColor(hex: value); view.updateTool() }
      Prop("width") { (view, value: Double) in view.inkWidth = value; view.updateTool() }
      Prop("eraserMode") { (view, value: String) in view.vectorEraser = value == "vector"; view.updateTool() }
      Prop("pattern") { (view, value: String) in view.paper.pattern = value; view.paper.setNeedsDisplay() }
      Prop("paperColor") { (view, value: String) in view.paper.backgroundColor = UIColor(hex: value) }
      Prop("readOnly") { (view, value: Bool) in view.canvas.isUserInteractionEnabled = !value }
      Prop("fingerDrawing") { (view, value: Bool) in view.setDrawingPolicy(value) }
      Prop("command") { (view, value: [String: Any]) in
        guard let id = value["id"] as? Int, id != view.lastCommand else { return }
        view.lastCommand = id
        switch value["action"] as? String {
        case "undo": view.canvas.undoManager?.undo()
        case "redo": view.canvas.undoManager?.redo()
        case "clear": view.canvas.drawing = PKDrawing(); view.persist()
        case "save": view.persist()
        default: break
        }
        view.notify()
      }
    }
  }
}

final class NotesCanvasView: ExpoView, PKCanvasViewDelegate {
  let canvas = PKCanvasView()
  let paper = PaperView()
  let onDrawingChange = EventDispatcher()
  let onError = EventDispatcher()
  var toolName = "pen"
  var inkColor = UIColor.label
  var inkWidth = 3.0
  var vectorEraser = false
  var lastCommand = -1
  private var fileURL: URL?
  private var loading = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addSubview(paper)
    addSubview(canvas)
    canvas.backgroundColor = .clear
    canvas.isOpaque = false
    canvas.isScrollEnabled = false
    canvas.delegate = self
    setDrawingPolicy(false)
    updateTool()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    paper.frame = bounds
    canvas.frame = bounds
    canvas.contentSize = bounds.size
  }

  func setDrawingPolicy(_ finger: Bool) {
    #if targetEnvironment(simulator) && DEBUG
    canvas.drawingPolicy = .anyInput
    #else
    canvas.drawingPolicy = finger ? .anyInput : .pencilOnly
    #endif
  }

  func updateTool() {
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
    do {
      canvas.drawing = FileManager.default.fileExists(atPath: url.path)
        ? try PKDrawing(data: Data(contentsOf: url)) : PKDrawing()
      canvas.undoManager?.removeAllActions()
    } catch { onError(["message": "Не удалось открыть страницу: \(error.localizedDescription)"]) }
    loading = false
    notify()
  }

  func persist() {
    guard !loading, let url = fileURL else { return }
    do {
      try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
      try canvas.drawing.dataRepresentation().write(to: url, options: .atomic)
      let thumbnail = url.deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("thumbnails/\(url.deletingPathExtension().lastPathComponent).png")
      let image = canvas.drawing.image(from: bounds, scale: 0.35)
      try image.pngData()?.write(to: thumbnail, options: .atomic)
    } catch { onError(["message": "Не удалось сохранить страницу: \(error.localizedDescription)"]) }
  }

  func notify() {
    onDrawingChange(["canUndo": canvas.undoManager?.canUndo ?? false, "canRedo": canvas.undoManager?.canRedo ?? false])
  }
  func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) { persist(); notify() }
}

private extension UIColor {
  convenience init(hex: String) {
    let value = UInt64(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    self.init(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255,
      blue: CGFloat(value & 255) / 255, alpha: 1)
  }
}
