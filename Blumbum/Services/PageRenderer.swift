import UIKit
import PDFKit
import PencilKit

enum PageRenderer {
    @MainActor
    static func background(_ page: NotePage, store: LibraryStore) throws -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1.5
        // Load and validate first: renderer closures cannot throw.
        let content = try load(page) { try store.readAsset($0) }
        return UIGraphicsImageRenderer(size: page.size, format: format).image { context in
            paint(page, content: content, context: context.cgContext)
        }
    }

    private struct Content {
        var document: PDFDocument?
        var pdf: PDFPage?
        var images: [(PageImage, UIImage)]
    }

    private static func load(_ page: NotePage, readAsset: (String) throws -> Data) throws -> Content {
        var pdfPage: PDFPage?
        var document: PDFDocument?
        if let name = page.pdfAsset {
            guard let pdf = PDFDocument(data: try readAsset(name)),
                  let index = page.pdfPage, let source = pdf.page(at: index) else { throw NoteError.invalidFile }
            pdfPage = source
            document = pdf
        }
        let images = try page.images.map { item -> (PageImage, UIImage) in
            let image = try ImageLoader.thumbnail(readAsset(item.asset))
            return (item, image)
        }
        return Content(document: document, pdf: pdfPage, images: images)
    }

    private static func paint(_ page: NotePage, content: Content, context: CGContext) {
        let rect = CGRect(origin: .zero, size: page.size)
        let tint = (page.pdfAsset == nil ? page.paperTint : nil) ?? .white
        let rgb = tint.rgb
        UIColor(red: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1).setFill()
        context.fill(rect)
        context.saveGState()
        context.clip(to: rect)
        if let pdf = content.pdf, let reference = pdf.pageRef {
            context.saveGState()
            context.translateBy(x: 0, y: page.size.height)
            context.scaleBy(x: 1, y: -1)
            let transform = reference.getDrawingTransform(.mediaBox, rect: rect, rotate: 0, preserveAspectRatio: true)
            context.concatenate(transform)
            context.drawPDFPage(reference)
            // CGPDFPage contains page content, but PDFKit annotations are separate objects.
            if pdf.displaysAnnotations {
                for annotation in pdf.annotations where annotation.shouldDisplay {
                    context.saveGState()
                    annotation.draw(with: .mediaBox, in: context)
                    context.restoreGState()
                }
            }
            context.restoreGState()
        } else {
            PaperTemplateRenderer.paint(page, context: context)
        }
        for (item, image) in content.images {
            image.draw(in: CGRect(x: item.x, y: item.y, width: item.width, height: item.height))
        }
        for item in page.texts {
            var textRect = CGRect(x: item.x, y: item.y, width: max(30, page.width - item.x - 32), height: max(30, page.height - item.y - 24))
            if let tint = item.background {
                let rgb = tint.rgb
                let noteRect = CGRect(x: item.x, y: item.y, width: min(240, textRect.width), height: min(180, textRect.height))
                UIColor(red: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1).setFill()
                UIBezierPath(roundedRect: noteRect, cornerRadius: 8).fill()
                textRect = noteRect.insetBy(dx: 14, dy: 14)
            }
            (item.text as NSString).draw(
                in: textRect,
                withAttributes: [.font: UIFont.systemFont(ofSize: item.fontSize), .foregroundColor: UIColor.black]
            )
        }
        context.restoreGState()
    }

    @MainActor
    static func thumbnail(_ page: NotePage, store: LibraryStore) async throws -> UIImage {
        let names = Set(page.images.map(\.asset) + [page.pdfAsset].compactMap { $0 })
        let paths = try Dictionary(uniqueKeysWithValues: names.map { ($0, try store.assetURL($0)) })
        store.pinAssets(names)
        defer { store.unpinAssets(names) }
        let data = try await PreviewQueue.shared.render(page, paths: paths)
        try Task.checkCancellation()
        guard let image = UIImage(data: data) else { throw NoteError.invalidFile }
        return image
    }

    // A serial actor prevents a visible page list from decoding many large PDFs at once.
    private actor PreviewQueue {
        static let shared = PreviewQueue()
        func render(_ page: NotePage, paths: [String: URL]) throws -> Data {
            try Task.checkCancellation()
            return try autoreleasepool {
                let content = try PageRenderer.load(page) { name in
                    guard let path = paths[name] else { throw NoteError.missingAsset(name) }
                    return try Data(contentsOf: path, options: .mappedIfSafe)
                }
                let scale = min(120 / page.size.width, 120 / page.size.height)
                let size = CGSize(width: page.size.width * scale, height: page.size.height * scale)
                let format = UIGraphicsImageRendererFormat(); format.scale = 2
                let drawing = page.drawing.isEmpty ? PKDrawing() : try PKDrawing(data: page.drawing)
                let image = UIGraphicsImageRenderer(size: size, format: format).image { context in
                    context.cgContext.scaleBy(x: scale, y: scale)
                    PageRenderer.paint(page, content: content, context: context.cgContext)
                    let rect = CGRect(origin: .zero, size: page.size)
                    drawing.image(from: rect, scale: scale * 2).draw(in: rect)
                }
                guard let data = image.pngData() else { throw NoteError.invalidFile }
                return data
            }
        }
    }

    @MainActor
    static func exportPDF(_ note: Notebook, store: LibraryStore) async throws -> URL {
        try LibraryStore.validate(note)
        let url = try store.exportURL(extension: "pdf")
        let names = Set(note.pages.flatMap { $0.images.map(\.asset) + [$0.pdfAsset].compactMap { $0 } })
        let paths = try Dictionary(uniqueKeysWithValues: names.map { ($0, try store.assetURL($0)) })
        store.pinAssets(names)
        defer { store.unpinAssets(names) }
        let work = Task.detached(priority: .userInitiated) {
            try renderPDF(note, to: url, assets: paths)
        }
        return try await withTaskCancellationHandler {
            try await work.value
        } onCancel: { work.cancel() }
    }

    private static func renderPDF(_ note: Notebook, to url: URL, assets: [String: URL]) throws -> URL {
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(origin: .zero, size: note.pages[0].size))
        var renderingError: Error?
        do {
            try renderer.writePDF(to: url) { context in
                for page in note.pages {
                    // Release page images and decoded PDF objects before the next page.
                    autoreleasepool {
                        do {
                            try Task.checkCancellation()
                            let content = try load(page) { name in
                                guard let path = assets[name] else { throw NoteError.missingAsset(name) }
                                return try Data(contentsOf: path, options: .mappedIfSafe)
                            }
                            let drawing = page.drawing.isEmpty ? PKDrawing() : try PKDrawing(data: page.drawing)
                            let rect = CGRect(origin: .zero, size: page.size)
                            context.beginPage(withBounds: rect, pageInfo: [:])
                            paint(page, content: content, context: context.cgContext)
                            let scale = min(3, 4096 / max(rect.width, rect.height))
                            drawing.image(from: rect, scale: scale).draw(in: rect)
                            UIColor.systemOrange.setFill()
                            for cover in page.studyCovers ?? [] { context.cgContext.fill(cover.rect) }
                        } catch { renderingError = error }
                    }
                    if renderingError != nil { break }
                }
            }
            if let renderingError { throw renderingError }
        } catch {
            try? FileManager.default.removeItem(at: url)
            throw error
        }
        return url
    }
}
