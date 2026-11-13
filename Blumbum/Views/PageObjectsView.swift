import SwiftUI

struct PageObjectsView: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let notebookID: UUID
    let pageID: UUID
    private var page: NotePage? { store.notebook(notebookID)?.pages.first { $0.id == pageID } }

    var body: some View {
        NavigationStack {
            Form {
                if let page {
                    Section {
                        Text("Печатный текст и изображения лежат под рукописью. Их положение и размер задаются здесь; лассо выделяет только рукопись.")
                            .font(.callout).foregroundStyle(.secondary)
                        Button("Добавить текст", systemImage: "text.badge.plus") {
                            store.updatePage(notebookID, pageID) { $0.texts.append(TextBlock(text: "Новая заметка")) }
                        }.disabled(page.texts.count >= 500)
                        Button("Добавить стикер", systemImage: "note.text.badge.plus") {
                            store.updatePage(notebookID, pageID) {
                                $0.texts.append(TextBlock(text: "Важная мысль", x: 60, y: 100, background: .ivory))
                            }
                        }.disabled(page.texts.count >= 500)
                    }
                    ForEach(page.texts) { item in
                        Section("Текст") {
                            TextEditor(text: textBinding(item.id, fallback: item.text)).frame(minHeight: 100)
                            Picker("Подложка", selection: Binding(get: {
                                self.page?.texts.first { $0.id == item.id }?.background
                            }, set: { tint in
                                store.updatePage(notebookID, pageID) { page in
                                    guard let index = page.texts.firstIndex(where: { $0.id == item.id }) else { return }
                                    page.texts[index].background = tint
                                }
                            })) {
                                Text("Без подложки").tag(nil as PaperTint?)
                                ForEach(PaperTint.allCases) { Text($0.title).tag(Optional($0)) }
                            }
                            slider("Размер шрифта", value: textValue(item.id, \.fontSize, fallback: item.fontSize), range: 8...96)
                            slider("По горизонтали", value: textValue(item.id, \.x, fallback: item.x), range: 0...max(1, page.width - 80))
                            slider("По вертикали", value: textValue(item.id, \.y, fallback: item.y), range: 0...max(1, page.height - 60))
                            Button("Удалить текст", role: .destructive) {
                                store.updatePage(notebookID, pageID) { $0.texts.removeAll { $0.id == item.id } }
                            }
                        }
                    }
                    ForEach(page.images) { item in
                        Section("Изображение") {
                            slider("По горизонтали", value: imageValue(item.id, \.x, fallback: item.x), range: 0...max(1, page.width - 24))
                            slider("По вертикали", value: imageValue(item.id, \.y, fallback: item.y), range: 0...max(1, page.height - 24))
                            slider("Ширина", value: Binding(get: {
                                self.page?.images.first { $0.id == item.id }?.width ?? item.width
                            }, set: { width in
                                store.updatePage(notebookID, pageID) { value in
                                    guard let index = value.images.firstIndex(where: { $0.id == item.id }) else { return }
                                    let ratio = value.images[index].height / max(1, value.images[index].width)
                                    value.images[index].width = width
                                    value.images[index].height = width * ratio
                                }
                            }), range: 24...min(page.width, max(24, 5000 * item.width / max(1, item.height))))
                            Button("Удалить изображение", role: .destructive) {
                                store.updatePage(notebookID, pageID) { $0.images.removeAll { $0.id == item.id } }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Текст и изображения")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { if store.flush() { dismiss() } } } }
            .onDisappear { store.flush() }
        }
    }

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>) -> some View {
        VStack(alignment: .leading) {
            Text("\(title): \(Int(value.wrappedValue))").font(.caption).foregroundStyle(.secondary)
            Slider(value: Binding(get: { min(range.upperBound, max(range.lowerBound, value.wrappedValue)) },
                                  set: { value.wrappedValue = $0 }), in: range).accessibilityLabel(title)
        }
    }
    private func textBinding(_ id: UUID, fallback: String) -> Binding<String> {
        Binding(get: { page?.texts.first { $0.id == id }?.text ?? fallback }, set: { text in
            store.updatePage(notebookID, pageID) { page in
                guard let index = page.texts.firstIndex(where: { $0.id == id }) else { return }
                page.texts[index].text = text
            }
        })
    }
    private func textValue(_ id: UUID, _ path: WritableKeyPath<TextBlock, Double>, fallback: Double) -> Binding<Double> {
        Binding(get: { page?.texts.first { $0.id == id }?[keyPath: path] ?? fallback }, set: { value in
            store.updatePage(notebookID, pageID) { page in
                guard let index = page.texts.firstIndex(where: { $0.id == id }) else { return }
                page.texts[index][keyPath: path] = value
            }
        })
    }
    private func imageValue(_ id: UUID, _ path: WritableKeyPath<PageImage, Double>, fallback: Double) -> Binding<Double> {
        Binding(get: { page?.images.first { $0.id == id }?[keyPath: path] ?? fallback }, set: { value in
            store.updatePage(notebookID, pageID) { page in
                guard let index = page.images.firstIndex(where: { $0.id == id }) else { return }
                page.images[index][keyPath: path] = value
            }
        })
    }
}
