import Foundation
import CoreGraphics

enum PaperFormat: String, CaseIterable, Identifiable, Hashable, Sendable {
    case a4, a5, letter, square, current
    var id: String { rawValue }
    var title: String {
        switch self {
        case .a4: return "A4"
        case .a5: return "A5"
        case .letter: return "US Letter"
        case .square: return "Квадрат"
        case .current: return "Текущий размер"
        }
    }
    var size: CGSize {
        switch self {
        case .a4, .current: return CGSize(width: 595, height: 842)
        case .a5: return CGSize(width: 420, height: 595)
        case .letter: return CGSize(width: 612, height: 792)
        case .square: return CGSize(width: 600, height: 600)
        }
    }
}

struct PaperConfiguration: Hashable, Sendable {
    var style: PaperStyle = .ruled
    var tint: PaperTint = .white
    var templateID: String? = nil
    var spacing: Double = 24
    var margin: Double = 30
    var format: PaperFormat = .a4
    var landscape = false
    var currentWidth: Double = 595
    var currentHeight: Double = 842
    var legacyLayout = false

    init(style: PaperStyle = .ruled, tint: PaperTint = .white) {
        self.style = style; self.tint = tint
    }

    init(page: NotePage) {
        style = page.paper; tint = page.paperTint ?? .white
        templateID = page.paperTemplateID; spacing = page.paperSpacing ?? (page.paper == .ruled ? 28 : 24); margin = page.paperMargin ?? 30
        legacyLayout = page.paperTemplateID == nil && page.paperSpacing == nil && page.paperMargin == nil
        currentWidth = page.width; currentHeight = page.height
        landscape = page.width > page.height
        format = PaperFormat.allCases.first {
            $0 != .current && abs(Double($0.size.width) - min(page.width, page.height)) < 1 && abs(Double($0.size.height) - max(page.width, page.height)) < 1
        } ?? .current
    }

    var size: CGSize {
        if format == .current { return CGSize(width: currentWidth, height: currentHeight) }
        let size = format.size
        return landscape ? CGSize(width: size.height, height: size.width) : size
    }

    func makePage() -> NotePage {
        var page = NotePage()
        apply(to: &page, resize: true)
        return page
    }

    func apply(to page: inout NotePage, resize: Bool) {
        page.paper = style; page.paperTint = tint; page.paperTemplateID = templateID
        page.paperSpacing = legacyLayout && templateID == nil ? nil : (spacing.isFinite ? min(48, max(16, spacing)) : 24)
        page.paperMargin = legacyLayout && templateID == nil ? nil : (margin.isFinite ? min(64, max(16, margin)) : 30)
        if resize { page.width = Double(size.width); page.height = Double(size.height) }
    }
}

struct PaperCatalog: Decodable, Sendable {
    var version: Int
    var templates: [PaperLayout]
    static let result: Result<PaperCatalog, Error> = Result {
        guard let url = Bundle.main.url(forResource: "PaperTemplates", withExtension: "json") else { throw NoteError.invalidFile }
        return try decode(Data(contentsOf: url))
    }
    static func decode(_ data: Data) throws -> PaperCatalog {
        let catalog = try JSONDecoder().decode(PaperCatalog.self, from: data)
        guard catalog.version == 1, !catalog.templates.isEmpty, Set(catalog.templates.map(\.id)).count == catalog.templates.count else { throw NoteError.invalidFile }
        for layout in catalog.templates {
            guard !layout.id.isEmpty, !layout.title.isEmpty, !layout.primitives.isEmpty else { throw NoteError.invalidFile }
            for item in layout.primitives {
                guard ["line", "rect", "label", "ruled", "checklist", "staff"].contains(item.kind),
                      item.x.isFinite, item.y.isFinite, (0...1).contains(item.x), (0...1).contains(item.y) else { throw NoteError.invalidFile }
                if item.kind == "line" {
                    guard let x = item.toX, let y = item.toY, x.isFinite, y.isFinite, (0...1).contains(x), (0...1).contains(y) else { throw NoteError.invalidFile }
                } else {
                    guard let w = item.w, let h = item.h, w.isFinite, h.isFinite, w > 0, h > 0,
                          item.x + w <= 1.000001, item.y + h <= 1.000001 else { throw NoteError.invalidFile }
                }
                if item.kind == "label" {
                    guard let text = item.text, !text.isEmpty, let font = item.fontSize, font.isFinite, (6...24).contains(font) else { throw NoteError.invalidFile }
                }
            }
        }
        return catalog
    }
    static var layouts: [PaperLayout] { (try? result.get().templates) ?? [] }
    static var loadFailed: Bool { if case .failure = result { return true }; return false }
}

struct PaperLayout: Decodable, Identifiable, Sendable {
    var id: String
    var title: String
    var subtitle: String
    var primitives: [PaperPrimitive]
}

struct PaperPrimitive: Decodable, Sendable {
    var kind: String
    var x: Double
    var y: Double
    var w: Double?
    var h: Double?
    var toX: Double?
    var toY: Double?
    var text: String?
    var fontSize: Double?
}
