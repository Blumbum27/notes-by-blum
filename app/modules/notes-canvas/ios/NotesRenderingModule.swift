import ExpoModulesCore
import UIKit
import PencilKit
import PDFKit

public final class NotesRenderingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotesRendering")
    AsyncFunction("thumbnails") { (path: String, json: String) -> [String] in
      let renderer = try NotebookRenderer(path: path, json: json)
      return try renderer.thumbnails()
    }.runOnQueue(.main)
    AsyncFunction("sharePDF") { (path: String, json: String, ids: [String], background: Bool, annotations: Bool) in
      let renderer = try NotebookRenderer(path: path, json: json)
      let url = try renderer.pdf(ids: ids, background: background, annotations: annotations)
      guard let controller = self.appContext?.utilities?.currentViewController() else {
        throw NSError(domain: "NotesRendering", code: 1, userInfo: [NSLocalizedDescriptionKey: "Не удалось открыть окно экспорта."])
      }
      let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      sheet.completionWithItemsHandler = { _, _, _, _ in
        try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
      }
      sheet.popoverPresentationController?.sourceView = controller.view
      sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.maxX - 64, y: 80, width: 1, height: 1)
      controller.present(sheet, animated: true)
    }.runOnQueue(.main)
  }
}

private final class NotebookRenderer {
  let directory: URL
  let manifest: [String: Any]
  var pages: [[String: Any]] { manifest["pages"] as? [[String: Any]] ?? [] }
  init(path: String, json: String) throws {
    guard let url = URL(string: path), url.isFileURL,
      let data = json.data(using: .utf8), let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw NSError(domain: "NotesRendering", code: 2)
    }
    directory = url; manifest = value
  }
  func size(_ page: [String: Any]) -> CGSize {
    let paper = page["paper"] as? [String: Any] ?? [:]
    let portrait = paper["size"] as? String == "Letter" ? CGSize(width: 612, height: 792) : CGSize(width: 595, height: 842)
    return paper["orientation"] as? String == "landscape" ? CGSize(width: portrait.height, height: portrait.width) : portrait
  }
  func color(_ value: String) -> UIColor {
    let number = UInt64(value.replacingOccurrences(of: "#", with: ""), radix: 16) ?? 0
    return UIColor(red: CGFloat(number >> 16 & 255) / 255, green: CGFloat(number >> 8 & 255) / 255, blue: CGFloat(number & 255) / 255, alpha: 1)
  }
  func outputSize(_ page: [String: Any]) -> CGSize {
    let original = size(page)
    let rotation = page["rotation"] as? Int ?? 0
    return rotation % 180 == 0 ? original : CGSize(width: original.height, height: original.width)
  }
  func draw(_ page: [String: Any], background: Bool = true, annotations: Bool = true) throws {
    let bounds = CGRect(origin: .zero, size: size(page))
    guard let context = UIGraphicsGetCurrentContext() else { return }
    context.saveGState()
    defer { context.restoreGState() }
    let angle = CGFloat(page["rotation"] as? Double ?? 0) * .pi / 180
    let output = outputSize(page)
    context.translateBy(x: output.width / 2, y: output.height / 2)
    context.rotate(by: angle)
    context.translateBy(x: -bounds.midX, y: -bounds.midY)
    if background {
      let source = page["background"] as? [String: Any] ?? [:]
      switch source["kind"] as? String {
      case "pdf":
        if let asset = source["asset"] as? String,
          let pdf = PDFDocument(url: directory.appendingPathComponent(asset)),
          let pdfPage = pdf.page(at: source["page"] as? Int ?? 0) {
          let box = pdfPage.bounds(for: .mediaBox)
          context.saveGState(); context.translateBy(x: 0, y: bounds.height)
          context.scaleBy(x: bounds.width / box.width, y: -bounds.height / box.height)
          pdfPage.draw(with: .mediaBox, to: context); context.restoreGState()
        }
      case "image":
        if let asset = source["asset"] as? String { UIImage(contentsOfFile: directory.appendingPathComponent(asset).path)?.draw(in: bounds) }
      default:
        let paper = source["paper"] as? [String: Any] ?? page["paper"] as? [String: Any] ?? [:]
        let view = PaperView(frame: bounds)
        view.pattern = paper["pattern"] as? String ?? "blank"
        view.backgroundColor = paper["color"] as? String == "yellow" ? color("#FFF6D5") : .white
        view.backgroundColor?.setFill(); context.fill(bounds)
        view.draw(bounds)
      }
    }
    guard annotations else { return }
    if let id = page["id"] as? String {
      let url = directory.appendingPathComponent("pages/\(id).drawing")
      if FileManager.default.fileExists(atPath: url.path) {
        let drawing = try PKDrawing(data: Data(contentsOf: url))
        drawing.image(from: bounds, scale: 2).draw(in: bounds)
      }
    }
    for object in page["objects"] as? [[String: Any]] ?? [] {
      let frame = CGRect(x: object["x"] as? Double ?? 0, y: object["y"] as? Double ?? 0,
        width: object["width"] as? Double ?? 100, height: object["height"] as? Double ?? 50)
      context.saveGState(); context.translateBy(x: frame.midX, y: frame.midY)
      context.rotate(by: CGFloat(object["rotation"] as? Double ?? 0) * .pi / 180)
      context.translateBy(x: -frame.midX, y: -frame.midY)
      if object["kind"] as? String == "image", let asset = object["asset"] as? String {
        UIImage(contentsOfFile: directory.appendingPathComponent(asset).path)?.draw(in: frame)
      } else if let text = object["text"] as? String {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = object["alignment"] as? String == "center" ? .center : object["alignment"] as? String == "right" ? .right : .left
        let pointSize = object["fontSize"] as? Double ?? 24
        var font = UIFont(name: object["fontFamily"] as? String ?? "", size: pointSize) ?? UIFont.systemFont(ofSize: pointSize)
        var traits: UIFontDescriptor.SymbolicTraits = []
        if object["bold"] as? Bool == true { traits.insert(.traitBold) }
        if object["italic"] as? Bool == true { traits.insert(.traitItalic) }
        if let descriptor = font.fontDescriptor.withSymbolicTraits(traits) { font = UIFont(descriptor: descriptor, size: pointSize) }
        (text as NSString).draw(in: frame, withAttributes: [.font: font, .foregroundColor: color(object["color"] as? String ?? "#151515"), .paragraphStyle: paragraph])
      }
      context.restoreGState()
    }
  }
  func thumbnails() throws -> [String] {
    let folder = directory.appendingPathComponent("thumbnails")
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    var paths: [String] = []
    for (index, page) in pages.enumerated() {
      guard let id = page["id"] as? String else { continue }
      let format = UIGraphicsImageRendererFormat(); format.scale = 0.4
      var failure: Error?
      let image = UIGraphicsImageRenderer(size: outputSize(page), format: format).image { _ in
        do { try draw(page) } catch { failure = error }
      }
      if let failure { throw failure }
      let url = folder.appendingPathComponent("\(id).png")
      guard let data = image.pngData() else { continue }
      try data.write(to: url, options: .atomic)
      if index == 0 { try data.write(to: folder.appendingPathComponent("cover.png"), options: .atomic) }
      paths.append(url.absoluteString)
    }
    return paths
  }
  func pdf(ids: [String], background: Bool, annotations: Bool) throws -> URL {
    let selected = pages.filter { ids.isEmpty || ids.contains($0["id"] as? String ?? "") }
    let title = (manifest["title"] as? String ?? "Блокнот").replacingOccurrences(of: "/", with: "-")
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let url = folder.appendingPathComponent("\(title).pdf")
    var failure: Error?
    try UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: CGSize(width: 595, height: 842))).writePDF(to: url) { renderer in
      for page in selected {
        renderer.beginPage(withBounds: CGRect(origin: .zero, size: outputSize(page)), pageInfo: [:])
        do { try draw(page, background: background, annotations: annotations) } catch { failure = error }
      }
    }
    if let failure { throw failure }
    return url
  }
}
