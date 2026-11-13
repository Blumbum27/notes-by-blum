import SwiftUI

struct PageBatchView: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let sourceID: UUID
    let currentPage: UUID
    let readOnly: Bool
    @State private var selection = Set<UUID>()
    @State private var destinationID: UUID?
    @State private var anchor: UUID?
    @State private var shared: SharedFile?
    @State private var busy = false
    @State private var issue: String?

    var body: some View {
        NavigationStack {
            Form {
                if let source = store.notebook(sourceID) {
                    Section("Страницы") {
                        Button(selection.count == source.pages.count ? "Снять выделение" : "Выбрать все") {
                            selection = selection.count == source.pages.count ? [] : Set(source.pages.map(\.id))
                        }
                        ForEach(Array(source.pages.enumerated()), id: \.element.id) { index, page in
                            Button {
                                if !selection.insert(page.id).inserted { selection.remove(page.id) }
                            } label: {
                                HStack {
                                    PageThumbnail(page: page)
                                    Text("Страница \(index + 1)")
                                    Spacer()
                                    Image(systemName: selection.contains(page.id) ? "checkmark.circle.fill" : "circle")
                                }
                            }
                        }
                    }
                    Section {
                        Button("Экспорт выбранных в PDF") {
                            var part = source
                            part.pages = source.pages.filter { selection.contains($0.id) }
                            busy = true
                            Task {
                                defer { busy = false }
                                do { shared = try await SharedFile(url: PageRenderer.exportPDF(part, store: store)) }
                                catch { issue = error.localizedDescription }
                            }
                        }.disabled(selection.isEmpty)
                    }
                    if !readOnly {
                        Section("Перенос в другую тетрадь") {
                            Picker("Тетрадь", selection: $destinationID) {
                                Text("Выбрать").tag(nil as UUID?)
                                ForEach(store.library.notebooks.filter { $0.id != sourceID && $0.deletedAt == nil }) { note in
                                    Text(note.title).tag(Optional(note.id))
                                }
                            }.onChange(of: destinationID) { _, _ in anchor = nil }
                            if let destinationID, let target = store.notebook(destinationID) {
                                Picker("Вставить", selection: $anchor) {
                                    Text("В конец").tag(nil as UUID?)
                                    ForEach(Array(target.pages.enumerated()), id: \.element.id) { index, page in
                                        Text("Перед страницей \(index + 1)").tag(Optional(page.id))
                                    }
                                }
                                Button("Копировать") { transfer(to: destinationID, move: false) }.disabled(selection.isEmpty)
                                Button("Переместить") { transfer(to: destinationID, move: true) }.disabled(selection.isEmpty)
                            }
                        }
                    }
                    if let issue { Text(issue).foregroundStyle(.red) }
                }
            }.navigationTitle("Выбранные страницы")
                .disabled(busy)
                .toolbar { Button("Готово") { dismiss() }.disabled(busy) }
                .sheet(item: $shared) { ShareSheet(url: $0.url) }
                .onAppear { if selection.isEmpty { selection = [currentPage] } }
        }
    }

    private func transfer(to id: UUID, move: Bool) {
        do {
            try store.transferPages(selection, from: sourceID, to: id, before: anchor, move: move)
            dismiss()
        } catch { issue = error.localizedDescription }
    }
}
