import SwiftUI
import PencilKit
import UIKit

struct InkElementsView: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: WritingSession
    let pageSize: CGSize
    @State private var saving = false
    @State private var title = ""
    @State private var message: String?
    @State private var deleting: InkElement?
    private var elements: [InkElement] { store.library.inkElements ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Сохраните рукописную подпись, значок или схему и вставляйте в другие страницы. Здесь сохраняется вся рукопись текущей страницы, без PDF, текста и фотографий.")
                        .font(.callout).foregroundStyle(.secondary)
                    Button("Сохранить рукопись этой страницы", systemImage: "plus.circle") {
                        title = "Элемент \(elements.count + 1)"; saving = true
                    }.buttonStyle(.borderedProminent).disabled(!session.hasInk || session.readOnly)
                    Text("До 50 элементов · до 1 МБ на элемент · до 10 МБ на полку").font(.caption).foregroundStyle(.secondary)
                    if let message { Text(message).foregroundStyle(.red).font(.callout) }
                    if elements.isEmpty {
                        ContentUnavailableView("Полка пока пустая", systemImage: "square.stack", description: Text("Нарисуйте элемент на странице и сохраните его здесь."))
                    } else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130))], spacing: 18) {
                            ForEach(elements) { element in
                                Button {
                                    do {
                                        guard try session.insertElement(element.drawing, pageSize: pageSize) else {
                                            message = "Вставка сейчас недоступна. Выйдите из режима чтения и повторите."; return
                                        }
                                        store.flush(); dismiss()
                                    } catch { message = error.localizedDescription }
                                } label: {
                                    VStack(spacing: 8) {
                                        InkElementPreview(element: element)
                                        Text(element.title).font(.callout).lineLimit(2).foregroundStyle(.primary)
                                    }
                                }.buttonStyle(.plain).disabled(session.readOnly)
                                    .accessibilityLabel("Вставить элемент \(element.title)")
                                    .contextMenu { Button("Удалить с полки", role: .destructive) { deleting = element } }
                            }
                        }
                    }
                }.padding(22)
            }.background(Theme.paper.opacity(0.6)).navigationTitle("Мои элементы")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
                .alert("Сохранить элемент", isPresented: $saving) {
                    TextField("Название", text: $title)
                    Button("Отмена", role: .cancel) {}
                    Button("Сохранить") {
                        do {
                            guard let drawing = session.canvas?.drawing else { throw NoteError.invalidFile }
                            try store.saveInkElement(title: title, drawing: drawing.dataRepresentation())
                            message = nil
                        } catch { message = error.localizedDescription }
                    }
                } message: { Text("Вся рукопись страницы станет одним повторно используемым элементом.") }
                .alert("Удалить элемент с полки?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                    Button("Отмена", role: .cancel) { deleting = nil }
                    Button("Удалить", role: .destructive) {
                        if let id = deleting?.id {
                            do { try store.deleteInkElement(id) } catch { message = error.localizedDescription }
                        }
                        deleting = nil
                    }
                } message: { Text("Уже вставленные копии на страницах сохранятся.") }
        }
    }
}

private struct InkElementPreview: View {
    let element: InkElement
    @State private var image: UIImage?
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12).fill(.white)
            if let image { Image(uiImage: image).resizable().scaledToFit().padding(12) }
            else { Image(systemName: "pencil.tip").foregroundStyle(.secondary) }
        }.frame(height: 115).task(id: element.id) {
            guard let drawing = try? InkElementPlacement.validate(element.drawing) else { return }
            let bounds = drawing.bounds.insetBy(dx: -4, dy: -4)
            image = drawing.image(from: bounds, scale: min(2, 220 / max(bounds.width, bounds.height)))
        }
    }
}
