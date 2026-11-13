import SwiftUI
import StoreKit

struct NewNotebookView: View {
    @EnvironmentObject private var store: LibraryStore
    @EnvironmentObject private var subscription: SubscriptionStore
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var paper = PaperConfiguration()
    @State private var showPaper = false
    @State private var color = "teal"
    @State private var error: String?
    let onCreated: (UUID) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("Тетрадь") { TextField("Название", text: $title).accessibilityIdentifier("notebook.title") }
                Section("Бумага") {
                    HStack { Spacer(); PaperPreview(configuration: paper).frame(height: 170); Spacer() }
                    Button("Выбрать бумагу и макет", systemImage: "rectangle.grid.2x2") { showPaper = true }
                    Text("\(paper.format.title) · \(paper.tint.title) · поля \(Int(paper.margin)) пт").font(.caption).foregroundStyle(.secondary)
                }
                Section("Обложка") { CoverPicker(selection: $color) }
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle("Новая тетрадь")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Создать") {
                        do {
                            let id = try store.create(title: title, color: color, configuration: paper, premium: subscription.hasPremium)
                            dismiss()
                            onCreated(id)
                        } catch { self.error = error.localizedDescription }
                    }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !subscription.isReady).accessibilityIdentifier("notebook.create")
                }
            }
            .sheet(isPresented: $showPaper) {
                PaperDesignerView(configuration: paper, canResize: true) { paper = $0; return true }
            }
        }
    }
}

struct CoverPicker: View {
    @Binding var selection: String
    var body: some View {
        HStack(spacing: 16) {
            ForEach(Theme.covers, id: \.self) { color in
                Button { selection = color } label: {
                    Circle().fill(Theme.cover(color)).frame(width: 38, height: 38)
                        .overlay { if color == selection { Image(systemName: "checkmark").foregroundStyle(.white) } }
                }.buttonStyle(.plain).accessibilityLabel("Обложка \(color)")
            }
        }.padding(.vertical, 6)
    }
}

struct NotebookSettingsView: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let note: Notebook
    @State private var title: String
    @State private var color: String
    @State private var folder: UUID?

    init(note: Notebook) {
        self.note = note
        _title = State(initialValue: note.title)
        _color = State(initialValue: note.color)
        _folder = State(initialValue: note.folderID)
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Название", text: $title)
                CoverPicker(selection: $color)
                Picker("Папка", selection: $folder) {
                    Text("Без папки").tag(nil as UUID?)
                    ForEach(store.library.folders) { Text($0.title).tag(Optional($0.id)) }
                }
            }.navigationTitle("Параметры тетради")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Сохранить") {
                            if store.update(note.id, { $0.title = title.trimmingCharacters(in: .whitespacesAndNewlines); $0.color = color; $0.folderID = folder }), store.flush() { dismiss() }
                        }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
        }
    }
}

struct PlusView: View {
    @EnvironmentObject private var subscription: SubscriptionStore
    @Environment(\.dismiss) private var dismiss
    @State private var showPrivacy = false
    @State private var manage = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Image(systemName: "leaf.circle.fill").font(.system(size: 64)).foregroundStyle(Theme.accent)
                    Text("Больше места\nдля ваших мыслей.").font(.system(.largeTitle, design: .serif, weight: .semibold))
                    Text("Бесплатно: до 3 тетрадей, все инструменты письма, шаблоны страниц, импорт и экспорт PDF, резервные копии.")
                    Label("notes by Blum Plus — тетради без ограничений", systemImage: "books.vertical")
                    Text("Ваши записи останутся доступны для чтения, редактирования и экспорта после окончания подписки.")
                        .font(.callout).foregroundStyle(.secondary)
                    if subscription.hasPremium {
                        Label("Подписка активна", systemImage: "checkmark.seal.fill").foregroundStyle(Theme.accent)
                        Button("Управлять подпиской") { manage = true }.buttonStyle(.bordered)
                    } else if subscription.products.isEmpty {
                        Text("Не удалось загрузить варианты подписки. Проверьте подключение и попробуйте позже. Бесплатные функции доступны.")
                            .font(.callout).foregroundStyle(.secondary)
                        Button("Обновить предложения") { Task { await subscription.load() } }
                    } else {
                        ForEach(subscription.products, id: \.id) { product in
                            Button { Task { await subscription.purchase(product) } } label: {
                                HStack {
                                    Text(product.displayName)
                                    Spacer()
                                    Text("\(product.displayPrice) / \(periodTitle(product))").bold()
                                }.padding(10)
                            }.buttonStyle(.borderedProminent).disabled(subscription.isBusy || !AppConfiguration.current.purchasesAllowed)
                        }
                        Text("Оплата через Apple ID. Подписка продлевается автоматически, пока вы её не отмените. Цена и период указаны выше; условия подтверждаются в окне Apple. Управление и отмена — в настройках подписок App Store.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if subscription.isBusy { ProgressView() }
                    if let message = subscription.message { Text(message).font(.callout).accessibilityAddTraits(.updatesFrequently) }
                    Button("Восстановить покупки") { Task { await subscription.restore() } }.disabled(subscription.isBusy)
                    Divider()
                    Button("Конфиденциальность и хранение данных") { showPrivacy = true }
                    if let url = AppConfiguration.current.privacyURL { Link("Политика конфиденциальности", destination: url) }
                    if let url = AppConfiguration.current.helpURL { Link("Поддержка", destination: url) }
                    if let url = AppConfiguration.current.emailURL { Link("Написать разработчику", destination: url) }
                    Link("Условия использования Apple (EULA)", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
                    Text("notes by Blum · \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")\nРезервная копия: удерживайте тетрадь → «Резервная копия .listnote». Удаление приложения удаляет локальные записи.")
                        .font(.caption).foregroundStyle(.secondary)
                }.padding(28)
            }.background(Theme.paper).navigationTitle("notes by Blum Plus")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
                .manageSubscriptionsSheet(isPresented: $manage)
                .sheet(isPresented: $showPrivacy) { PrivacyView() }
        }
    }

    private func periodTitle(_ product: Product) -> String {
        guard let period = product.subscription?.subscriptionPeriod else { return "период" }
        let unit: String
        switch period.unit {
        case .day: unit = "дн."
        case .week: unit = "нед."
        case .month: unit = "мес."
        case .year: unit = "г."
        @unknown default: unit = "период"
        }
        return "\(period.value) \(unit)"
    }
}

struct PrivacyView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                Text("Тетради, рукопись, изображения и импортированные PDF хранятся локально на вашем устройстве. Приложение не содержит рекламы, аналитики, аккаунтов, AI и сервера для загрузки заметок.\n\nФотографии доступны только через системный выбор изображений. Выбирая экспорт, вы сами определяете приложение или получателя файла.\n\nПокупки обрабатывает Apple. Приложение проверяет статус подписки через StoreKit и не получает платёжные реквизиты.\n\nУдаление приложения удалит локальную библиотеку. Для переноса и восстановления экспортируйте каждую тетрадь в .listnote и сохраните файл вне приложения, например в «Файлы». PDF предназначен для просмотра и не заменяет редактируемую копию.\n\niCloud-синхронизация в этой версии отсутствует.")
                    .padding(24)
            }.navigationTitle("Конфиденциальность")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
        }
    }
}
