import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let listnote = UTType(exportedAs: "app.blumbum.notebook", conformingTo: .json)
}

struct LibraryView: View {
    @EnvironmentObject private var store: LibraryStore
    @EnvironmentObject private var subscription: SubscriptionStore
    @State private var section: String? = "all"
    @State private var search = ""
    @State private var path: [UUID] = []
    @State private var newNotebook = false
    private enum PickerPurpose {
        case document, syncFolder, backupFolder, backupFile, recovery
        var types: [UTType] {
            switch self {
            case .document: return [.pdf, .listnote, .jpeg, .png, .heic, .tiff, .webP]
            case .syncFolder, .backupFolder: return [.folder]
            case .backupFile: return [UTType(filenameExtension:"blumlibrary") ?? .data]
            case .recovery: return [.listnote]
            }
        }
    }
    @State private var pickerPurpose: PickerPurpose = .document
    @State private var importing = false
    @State private var searchingPages = false
    @AppStorage("library.sort") private var sort = "recent"
    @State private var confirmRecovery = false
    @State private var showPlus = false
    @State private var newFolder = false
    @State private var folderName = ""
    @State private var editing: Notebook?
    @State private var deleting: Notebook?
    @State private var shared: SharedFile?

    private var title: String {
        if section == "favorites" { return "Избранное" }
        if section == "trash" { return "Корзина" }
        return store.library.folders.first { $0.id.uuidString == section }?.title ?? "Мои тетради"
    }

    private var notes: [Notebook] {
        store.library.notebooks.filter { note in
            let inSection: Bool
            switch section {
            case "trash": inSection = note.deletedAt != nil
            case "favorites": inSection = note.deletedAt == nil && note.favorite
            case "all", nil: inSection = note.deletedAt == nil
            default: inSection = note.deletedAt == nil && note.folderID?.uuidString == section
            }
            return inSection && (search.isEmpty || note.title.localizedCaseInsensitiveContains(search)
                || note.pages.contains { $0.texts.contains { $0.text.localizedCaseInsensitiveContains(search) } })
        }.sorted {
            if sort == "title" { return $0.title.localizedStandardCompare($1.title) == .orderedAscending }
            if sort == "created" { return $0.createdAt > $1.createdAt }
            return $0.updatedAt > $1.updatedAt
        }
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $section) {
                Section {
                    Label("Все тетради", systemImage: "books.vertical").tag("all")
                    Button("Быстрая заметка", systemImage: "square.and.pencil") {
                        do {
                            let id = try store.create(title: "Заметка " + Date().formatted(date: .numeric, time: .shortened), paper: .ruled, color: "teal", premium: subscription.hasPremium)
                            section = "all"; path = [id]
                        } catch NoteError.limitReached { showPlus = true } catch { store.error = error.localizedDescription }
                    }.disabled(store.loadFailed || !subscription.isReady)
                    Picker("Сортировка", selection: $sort) {
                        Text("По изменению").tag("recent")
                        Text("По названию").tag("title")
                        Text("По созданию").tag("created")
                    }
                    Label("Избранное", systemImage: "star").tag("favorites")
                } header: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("notes by Blum").font(.system(size: 38, weight: .semibold, design: .serif)).foregroundStyle(Theme.accent)
                        Text("МЕСТО ДЛЯ МЫСЛЕЙ").font(.caption2).tracking(2)
                    }.padding(.vertical, 20)
                }
                Section("Папки") {
                    ForEach(store.library.folders) { folder in
                        Label(folder.title, systemImage: "folder").tag(folder.id.uuidString)
                    }
                    Button { newFolder = true } label: { Label("Новая папка", systemImage: "folder.badge.plus") }
                }
                Section {
                    Label("Корзина", systemImage: "trash").tag("trash")
                    Button("Подключить папку iCloud Drive", systemImage: "icloud") { pick(.syncFolder) }
                    Menu("Резервные копии", systemImage: "externaldrive") {
                        Button("Экспорт всей библиотеки") {
                            do { shared = try SharedFile(url:store.exportLibrary()) } catch { store.error = error.localizedDescription }
                        }
                        Button("Папка автоматических копий") { pick(.backupFolder) }
                        Button("Восстановить полную копию") { pick(.backupFile) }
                    }
                    if !store.backupStatus.isEmpty { Text(store.backupStatus).font(.caption) }
                    if !store.syncStatus.isEmpty { Text(store.syncStatus).font(.caption) }
                    Button { showPlus = true } label: {
                        Label(subscription.hasPremium ? "notes by Blum Plus · активен" : "notes by Blum Plus", systemImage: "sparkles")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper)
            .navigationTitle("Библиотека")
            .navigationBarTitleDisplayMode(.inline)
        } detail: {
            NavigationStack(path: $path) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 26) {
                        if let notice = store.recoveryNotice {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Восстановлено предыдущее сохранение", systemImage: "externaldrive.badge.checkmark").font(.headline)
                                Text(notice).font(.callout)
                                Button("Понятно") { store.dismissRecoveryNotice() }
                            }.padding().frame(maxWidth: .infinity, alignment: .leading)
                                .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                        }
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(title).font(.system(.largeTitle, design: .serif, weight: .semibold))
                                Text(section == "trash" ? "Тетради хранятся здесь до удаления вручную." : "Идеи, планы и всё, что хочется сохранить.")
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if store.isBusy { ProgressView() }
                        }
                        if store.loadFailed {
                            ContentUnavailableView("Не удалось открыть библиотеку", systemImage: "externaldrive.badge.exclamationmark", description: Text("Исходные файлы защищены от перезаписи. Можно восстановить тетрадь из ранее сохранённого файла .listnote."))
                            Button("Восстановить из резервной копии") { confirmRecovery = true }
                                .buttonStyle(.borderedProminent).disabled(store.isBusy)
                        } else if notes.isEmpty {
                            ContentUnavailableView {
                                Label(search.isEmpty ? "Здесь начинается новая мысль" : "Ничего не найдено", systemImage: "book.closed")
                            } description: {
                                Text(search.isEmpty ? "Создайте тетрадь или импортируйте PDF." : "Поиск работает по названиям и печатному тексту.")
                            } actions: {
                                if search.isEmpty && section != "trash" { Button("Создать тетрадь") { createRequested() }.buttonStyle(.borderedProminent) }
                            }
                        } else {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156, maximum: 220), spacing: 24)], alignment: .leading, spacing: 30) {
                                ForEach(notes) { note in
                                    Button { if note.deletedAt == nil { path.append(note.id) } } label: { NotebookCard(note: note) }
                                        .buttonStyle(.plain)
                                        .contextMenu { contextMenu(note) }
                                        .accessibilityLabel("\(note.title), \(note.pages.count) страниц")
                                }
                            }
                        }
                    }.padding(28)
                }
                .background(Theme.paper.opacity(0.55))
                .navigationTitle("notes by Blum")
                .navigationBarTitleDisplayMode(.inline)
                .searchable(text: $search, prompt: "Название или печатный текст")
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button { searchingPages = true } label: { Image(systemName: "doc.text.magnifyingglass") }.accessibilityLabel("Поиск по всем страницам")
                        Button { showPlus = true } label: { Image(systemName: "sparkles") }.accessibilityLabel("Подписка и настройки")
                        Button { pick(.document) } label: { Image(systemName: "square.and.arrow.down") }.accessibilityLabel("Импорт PDF или тетради")
                            .disabled(store.isBusy || store.loadFailed || !subscription.isReady)
                        Button { createRequested() } label: { Label("Тетрадь", systemImage: "plus") }
                            .accessibilityIdentifier("library.create")
                            .disabled(store.loadFailed || !subscription.isReady)
                    }
                }
                .navigationDestination(for: UUID.self) { id in NotebookEditor(notebookID: id) }
            }
        }
        .sheet(isPresented: $newNotebook) {
            NewNotebookView { id in path.append(id) }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: pickerPurpose.types) { result in
            do {
                let url = try result.get()
                switch pickerPurpose {
                case .document: Task { await store.importDocument(url, premium: subscription.hasPremium) }
                case .recovery: Task { await store.restoreBlockedLibrary(from: url) }
                case .syncFolder: try store.chooseSyncFolder(url); Task { await store.syncPages() }
                case .backupFolder: try store.chooseBackupFolder(url)
                case .backupFile: try store.restoreFullBackup(url)
                }
            } catch {
                if (error as NSError).domain != NSCocoaErrorDomain || (error as NSError).code != NSUserCancelledError {
                    store.error = error.localizedDescription
                }
            }
        }
        .sheet(isPresented: $showPlus) { PlusView() }
        .sheet(isPresented: $searchingPages) {
            NoteSearch(notebookID: nil) { id, page in
                UserDefaults.standard.set(page.uuidString, forKey: "lastPage.\(id.uuidString)")
                path.append(id)
            }
        }
        .sheet(item: $editing) { note in NotebookSettingsView(note: note) }
        .sheet(item: $shared) { ShareSheet(url: $0.url) }
        .alert("Восстановить из .listnote?", isPresented: $confirmRecovery) {
            Button("Отмена", role: .cancel) {}
            Button("Выбрать копию") { pick(.recovery) }
        } message: {
            Text("Сначала будет проверена выбранная копия. При успехе откроется библиотека с одной восстановленной тетрадью. Все исходные недоступные файлы и вложения будут сохранены отдельно, без удаления.")
        }
        .alert("Новая папка", isPresented: $newFolder) {
            TextField("Название", text: $folderName)
            Button("Отмена", role: .cancel) { folderName = "" }
            Button("Создать") {
                do { try store.addFolder(folderName); folderName = "" }
                catch { store.error = error.localizedDescription }
            }
        }
        .alert("Удалить тетрадь навсегда?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
            Button("Отмена", role: .cancel) { deleting = nil }
            Button("Удалить", role: .destructive) {
                if let note = deleting {
                    do { try store.deletePermanently(note.id) } catch { store.error = error.localizedDescription }
                }
                deleting = nil
            }
        } message: { Text("Восстановить её можно будет только из заранее экспортированной копии .listnote.") }
    }

    private func pick(_ purpose: PickerPurpose) {
        pickerPurpose = purpose
        importing = true
    }

    private func createRequested() {
        guard subscription.isReady else { return }
        if !subscription.hasPremium && store.library.notebooks.count >= 3 { showPlus = true }
        else { newNotebook = true }
    }

    @ViewBuilder private func contextMenu(_ note: Notebook) -> some View {
        if note.deletedAt == nil {
            Button("Название, обложка и папка", systemImage: "pencil") { editing = note }
            Button(note.favorite ? "Убрать из избранного" : "В избранное", systemImage: "star") { store.update(note.id) { $0.favorite.toggle() } }
            Button("Дублировать", systemImage: "doc.on.doc") {
                do { try store.duplicate(note.id, premium: subscription.hasPremium) } catch { store.error = error.localizedDescription }
            }.disabled(!subscription.isReady)
            Button("Резервная копия .listnote", systemImage: "square.and.arrow.up") {
                do { shared = SharedFile(url: try store.exportArchive(note)) } catch { store.error = error.localizedDescription }
            }
            Button("В корзину", systemImage: "trash", role: .destructive) { store.update(note.id) { $0.deletedAt = Date() } }
        } else {
            Button("Восстановить", systemImage: "arrow.uturn.backward") { store.update(note.id) { $0.deletedAt = nil } }
            Button("Удалить навсегда", systemImage: "trash", role: .destructive) { deleting = note }
        }
    }
}

private struct NotebookCard: View {
    let note: Notebook
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 10).fill(Theme.cover(note.color).gradient)
                Rectangle().fill(.black.opacity(0.12)).frame(width: 12).padding(.leading, 12)
                VStack(alignment: .leading, spacing: 12) {
                    Image(systemName: "leaf").font(.title2).opacity(0.7)
                    Spacer()
                    Text(note.title).font(.system(.title3, design: .serif, weight: .semibold)).lineLimit(4)
                    HStack {
                        Text("B L U M B U M").font(.caption2)
                        Spacer()
                        if note.favorite { Image(systemName: "star.fill").font(.caption) }
                    }.opacity(0.7)
                }.foregroundStyle(.white).padding(24).padding(.leading, 8)
            }.aspectRatio(0.76, contentMode: .fit).shadow(color: .black.opacity(0.13), radius: 8, y: 5)
            Text(note.title).font(.headline).lineLimit(1)
            Text("\(note.pages.count) стр. · \(note.updatedAt.formatted(date: .abbreviated, time: .omitted))")
                .font(.caption).foregroundStyle(.secondary)
        }.contentShape(Rectangle())
    }
}
