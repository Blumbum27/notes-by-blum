import SwiftUI
import PencilKit
import PDFKit
import Vision

private struct SearchHit: Identifiable {
    let id = UUID()
    let notebook: UUID
    let page: UUID
    let location: String
    let excerpt: AttributedString
}

actor PageTextReader {
    private var document: PDFDocument?
    private var documentURL: URL?

    func text(_ page: NotePage, pdfURL: URL?) throws -> String {
        var parts = page.texts.map(\.text)
        if let pdfURL, let index = page.pdfPage {
            if documentURL != pdfURL {
                document = PDFDocument(url: pdfURL)
                documentURL = pdfURL
            }
            if let text = document?.page(at: index)?.string { parts.append(text) }
        }
        if !page.drawing.isEmpty {
            let ink = try PKDrawing(data: page.drawing)
            guard !ink.strokes.isEmpty else { return parts.joined(separator: "\n") }
            let bounds = ink.bounds.insetBy(dx: -8, dy: -8)
            let scale = min(3, 3000 / max(1, max(bounds.width, bounds.height)))
            let format = UIGraphicsImageRendererFormat()
            format.opaque = true
            format.scale = scale
            let image = UIGraphicsImageRenderer(size: bounds.size, format: format).image { context in
                UIColor.white.setFill()
                let rect = CGRect(origin: .zero, size: bounds.size)
                context.fill(rect)
                ink.image(from: bounds, scale: scale).draw(in: rect)
            }
            if let cg = image.cgImage {
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                let languages = try request.supportedRecognitionLanguages()
                request.recognitionLanguages = languages.filter { $0.hasPrefix("ru") || $0.hasPrefix("en") }.sorted { $0.hasPrefix("ru") && !$1.hasPrefix("ru") }
                try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
                parts += (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
            }
        }
        return parts.joined(separator: "\n")
    }
}

struct NoteSearch: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let notebookID: UUID?
    let open: (UUID, UUID) -> Void
    @State private var query = ""
    @State private var hits: [SearchHit] = []
    @State private var searching = false
    @State private var skipped = 0

    var body: some View {
        NavigationStack {
            List {
                if searching { ProgressView("Ищу по страницам…") }
                if skipped > 0 { Text("Страниц с ошибкой распознавания: " + String(skipped)).font(.caption) }
                if !searching && hits.isEmpty && !query.isEmpty { Text("Совпадений нет") }
                ForEach(hits) { hit in
                    Button {
                        dismiss()
                        open(hit.notebook, hit.page)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(hit.location).font(.caption)
                            Text(hit.excerpt).foregroundStyle(.primary)
                        }
                    }
                }
            }
            .navigationTitle("Поиск по страницам")
            .searchable(text: $query, prompt: "Текст, PDF или рукопись")
            .toolbar { Button("Закрыть") { dismiss() } }
            .task(id: query) { await search() }
        }
    }

    @MainActor private func search() async {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        hits = []; skipped = 0; searching = !needle.isEmpty
        guard !needle.isEmpty else { return }
        do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
        let reader = PageTextReader()
        for note in store.library.notebooks where note.deletedAt == nil && (notebookID == nil || notebookID == note.id) {
            for (index, page) in note.pages.enumerated() {
                if Task.isCancelled { return }
                do {
                    let url = try page.pdfAsset.map { try store.assetURL($0) }
                    let text = try await reader.text(page, pdfURL: url)
                    if Task.isCancelled { return }
                    guard let match = text.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) else { continue }
                    let start = text.index(match.lowerBound, offsetBy: -35, limitedBy: text.startIndex) ?? text.startIndex
                    let end = text.index(match.upperBound, offsetBy: 60, limitedBy: text.endIndex) ?? text.endIndex
                    var result = AttributedString(text[start..<match.lowerBound])
                    var highlight = AttributedString(text[match])
                    highlight.backgroundColor = .yellow
                    highlight.foregroundColor = .black
                    result += highlight + AttributedString(text[match.upperBound..<end])
                    hits.append(SearchHit(notebook: note.id, page: page.id, location: note.title + " · " + String(index + 1), excerpt: result))
                } catch { if !Task.isCancelled { skipped += 1 } }
            }
        }
        if !Task.isCancelled { searching = false }
    }
}
