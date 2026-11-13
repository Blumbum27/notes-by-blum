import SwiftUI
import PDFKit

struct SourcePDFReader: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL
    let index: Int
    let open: (Int) -> Void
    @State private var reader = PDFView()
    @State private var contents = false
    var body: some View {
        NavigationStack {
            PDFSurface(reader: reader, url: url, index: index)
                .navigationTitle("Исходный PDF")
                .toolbar {
                    Button("Оглавление") { contents = true }
                    Button("К заметкам") {
                        if let doc = reader.document, let page = reader.currentPage { open(doc.index(for: page)) }
                        dismiss()
                    }
                }.sheet(isPresented: $contents) {
                    NavigationStack {
                        List {
                            if let outline = reader.document?.outlineRoot, outline.numberOfChildren > 0 {
                                ForEach(0..<outline.numberOfChildren, id: \.self) { i in
                                    if let node = outline.child(at: i) { outlineRow(node) }
                                }
                            } else { Text("В этом PDF нет оглавления") }
                        }.navigationTitle("Оглавление").toolbar { Button("Закрыть") { contents = false } }
                    }
                }
        }
    }
    private func outlineRow(_ node: PDFOutline) -> AnyView {
        AnyView(VStack(alignment: .leading) {
            Button(node.label ?? "Раздел") {
                if let target = node.destination { reader.go(to: target); contents = false }
                else if let jump = node.action as? PDFActionGoTo { reader.go(to: jump.destination); contents = false }
            }
            if node.numberOfChildren > 0 {
                DisclosureGroup("Подразделы") {
                    ForEach(0..<node.numberOfChildren, id: \.self) { i in
                        if let child = node.child(at: i) { outlineRow(child) }
                    }
                }
            }
        })
    }
}
private struct PDFSurface: UIViewRepresentable {
    let reader: PDFView
    let url: URL
    let index: Int
    func makeUIView(context: Context) -> PDFView {
        reader.document = PDFDocument(url: url)
        reader.autoScales = true
        reader.displayMode = .singlePageContinuous
        if let page = reader.document?.page(at: index) { reader.go(to: page) }
        return reader
    }
    func updateUIView(_ view: PDFView, context: Context) {}
}
