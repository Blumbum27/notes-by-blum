import SwiftUI
import UIKit

struct PaperDesignerView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draft: PaperConfiguration
    @State private var failure: String?
    let canResize: Bool
    let failureInfo: () -> String?
    let onApply: (PaperConfiguration) -> Bool

    init(configuration: PaperConfiguration, canResize: Bool, failureInfo: @escaping () -> String? = { nil }, onApply: @escaping (PaperConfiguration) -> Bool) {
        var modern = configuration; modern.legacyLayout = false
        _draft = State(initialValue: modern); self.canResize = canResize; self.onApply = onApply
        self.failureInfo = failureInfo
    }

    var body: some View {
        NavigationStack {
            Form {
                if let failure { Text(failure).foregroundStyle(.red) }
                Section {
                    HStack { Spacer(); PaperPreview(configuration: draft).frame(height: 245); Spacer() }
                        .listRowBackground(Theme.paper)
                    Text("Меняется подложка. Рукопись, фотографии и текст остаются на своих координатах.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Цвет бумаги") {
                    HStack(spacing: 14) {
                        ForEach(PaperTint.allCases) { tint in
                            Button { draft.tint = tint } label: {
                                let rgb = tint.rgb
                                Circle().fill(Color(red: rgb.0, green: rgb.1, blue: rgb.2)).frame(width: 38, height: 38)
                                    .overlay(Circle().stroke(draft.tint == tint ? Theme.accent : .gray.opacity(0.3), lineWidth: draft.tint == tint ? 3 : 1))
                                    .overlay { if draft.tint == tint { Image(systemName: "checkmark").foregroundStyle(Theme.accent) } }
                            }.buttonStyle(.plain).accessibilityLabel(tint.title).accessibilityAddTraits(draft.tint == tint ? .isSelected : [])
                        }
                    }
                }
                Section("Макет страницы") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 125), spacing: 12)], spacing: 16) {
                        ForEach(PaperStyle.allCases) { style in
                            layoutCard(title: style.title, selected: draft.templateID == nil && draft.style == style,
                                       configuration: basicConfiguration(style)) {
                                draft.templateID = nil; draft.style = style
                            }
                        }
                        ForEach(PaperCatalog.layouts) { layout in
                            layoutCard(title: layout.title, selected: draft.templateID == layout.id,
                                       configuration: layoutConfiguration(layout.id)) { draft.templateID = layout.id }
                        }
                    }.padding(.vertical, 6)
                    if PaperCatalog.loadFailed {
                        Text("Не удалось загрузить дополнительные макеты. Базовая бумага доступна.").foregroundStyle(.red).font(.caption)
                    }
                }
                Section("Разметка") {
                    Text("Шаг разметки: \(Int(draft.spacing)) пт").font(.callout)
                    Slider(value: $draft.spacing, in: 16...48, step: 2).accessibilityLabel("Шаг разметки")
                    Text("Поля: \(Int(draft.margin)) пт").font(.callout)
                    Slider(value: $draft.margin, in: 16...64, step: 2).accessibilityLabel("Поля страницы")
                }
                Section("Формат") {
                    Picker("Размер", selection: $draft.format) {
                        ForEach(PaperFormat.allCases.filter { $0 != .current || draft.format == .current }) { Text($0.title).tag($0) }
                    }.disabled(!canResize)
                    Toggle("Альбомная ориентация", isOn: $draft.landscape)
                        .disabled(!canResize || draft.format == .square || draft.format == .current)
                    if !canResize {
                        Text("Размер меняется только у пустого листа. Создайте новый лист, чтобы сменить формат без обрезки существующих записей.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }.navigationTitle("Бумага и макет")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Применить") {
                            if onApply(draft) { dismiss() }
                            else { failure = failureInfo() ?? "Не удалось применить настройки. Изменения не внесены." }
                        }.accessibilityIdentifier("paper.apply")
                    }
                }
        }
    }

    private func basicConfiguration(_ style: PaperStyle) -> PaperConfiguration {
        var config = draft; config.style = style; config.templateID = nil; return config
    }
    private func layoutConfiguration(_ id: String) -> PaperConfiguration {
        var config = draft; config.templateID = id; return config
    }
    private func layoutCard(title: String, selected: Bool, configuration: PaperConfiguration, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                PaperPreview(configuration: configuration).frame(height: 130)
                Text(title).font(.caption).foregroundStyle(.primary).lineLimit(2)
            }.padding(8).frame(maxWidth: .infinity)
                .background(selected ? Theme.accent.opacity(0.09) : .clear, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? Theme.accent : .gray.opacity(0.2), lineWidth: selected ? 2 : 1))
        }.buttonStyle(.plain).accessibilityLabel(title).accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct PaperPreview: View {
    let configuration: PaperConfiguration
    @State private var image: UIImage?
    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFit().shadow(color: .black.opacity(0.12), radius: 3, y: 2) }
            else { ProgressView() }
        }.task(id: configuration) { image = PaperTemplateRenderer.preview(configuration) }
            .accessibilityHidden(true)
    }
}

struct PaperSheetRequest: Identifiable {
    let id = UUID()
    let page: NotePage
    let adding: Bool
    let canResize: Bool
}
