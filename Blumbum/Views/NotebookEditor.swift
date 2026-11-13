import SwiftUI
import PhotosUI
import VisionKit
import PencilKit
import UIKit

struct NotebookEditor: View {
    @Environment(\.dismiss) private var dismissEditor
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var session = WritingSession()
    let notebookID: UUID
    @State private var pageID: UUID?
    @State private var background: UIImage?
    @State private var renderError: String?
    @State private var showPages = false
    @State private var searchingPages = false
    @State private var pageBatch = false
    @State private var sourcePDF = false
    @State private var referenceOpen = false
    @State private var scanning = false
    @State private var workspace = false
    @State private var studyCards = false
    @State private var clockOpen = false
    @State private var canvasRevision = UUID()
    @State private var previousPage: UUID?
    @State private var showObjects = false
    @State private var showHelp = false
    @State private var showWritingSettings = false
    @State private var confirmClearInk = false
    @State private var showInkElements = false
    @State private var paperRequest: PaperSheetRequest?
    @State private var shared: SharedFile?
    @State private var photo: PhotosPickerItem?
    @State private var isAddingImage = false
    @State private var exportingPDF = false
    @State private var exportTask: Task<Void, Never>?
    @AppStorage("fingerDrawing") private var fingerDrawing = true
    @AppStorage("scribbleErase") private var scribbleErase = true
    @AppStorage("straightenLines") private var straightenLines = false
    @AppStorage("gestureHaptics") private var gestureHaptics = true
    @AppStorage("showQuickTools") private var showQuickTools = true
    @AppStorage("quickPenWidth") private var quickPenWidth = 2.0

    private var note: Notebook? { store.notebook(notebookID) }
    private var page: NotePage? { note?.pages.first { $0.id == pageID } ?? note?.pages.first }
    private var pageIndex: Int { note?.pages.firstIndex { $0.id == page?.id } ?? 0 }

    var body: some View {
        VStack(spacing: 0) {
            if let note, let page {
                HStack(spacing: 16) {
                    Button { session.prepareForModal(); showPages = true } label: { Label("\(pageIndex + 1) / \(note.pages.count)", systemImage: "square.grid.2x2") }
                        .accessibilityLabel("Страница \(pageIndex + 1) / \(note.pages.count)")
                        .accessibilityIdentifier("pages.open")
                    Spacer(minLength: 0)
                    Button { navigate(-1) } label: { Image(systemName: "chevron.left") }.disabled(pageIndex == 0).accessibilityLabel("Предыдущая страница")
                    Button { navigate(1) } label: { Image(systemName: "chevron.right") }.disabled(pageIndex >= note.pages.count - 1).accessibilityLabel("Следующая страница")
                    Button { store.updatePage(notebookID, page.id) { $0.bookmarked.toggle() } } label: {
                        Image(systemName: page.bookmarked ? "bookmark.fill" : "bookmark")
                    }.accessibilityLabel("Закладка страницы")
                    Menu {
                        Button("Такой же лист") { addPage(page.paper, keepLayout: true) }
                        Button("Выбрать макет нового листа…") { requestPaper(adding: true) }
                        Divider()
                        ForEach(PaperStyle.allCases) { style in
                            Button(style.title) { addPage(style) }
                        }
                    } label: { Image(systemName: "plus.rectangle.on.rectangle") }.accessibilityLabel("Добавить страницу").accessibilityIdentifier("pages.add").disabled(session.readOnly)
                }.padding(.horizontal, 18).padding(.vertical, 12).background(Theme.paper)
                quickToolsBar

                if let renderError {
                    ContentUnavailableView("Страница не загружена", systemImage: "exclamationmark.triangle", description: Text(renderError))
                    Button("Повторить") { render(page) }
                } else if let background {
                    HStack(spacing:0) {
                    if referenceOpen {
                        ReferencePane(editorID:notebookID,visible:$referenceOpen).frame(maxWidth:.infinity)
                        Divider()
                    }
                    WritingCanvas(drawing: page.drawing, size: page.size, background: background,
                                  fingerDrawing: fingerDrawing, scribbleErase: scribbleErase,
                                  straightenLines: straightenLines, haptics: gestureHaptics, session: session) { data in
                        store.updatePage(notebookID, page.id) { $0.drawing = data }
                    }.id(CanvasIdentity(pageID: page.id, width: page.width, height: page.height, revision: canvasRevision))
                    }
                } else { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            } else {
                ContentUnavailableView("Тетрадь не найдена", systemImage: "book.closed")
            }
        }
        .overlay(alignment: .top) {
            if let hint = session.hint {
                HStack(spacing: 12) {
                    Text(hint).font(.callout)
                    Button("Отменить") { session.undo() }.disabled(!session.canUndo || session.readOnly)
                }.padding(12).background(.regularMaterial, in: Capsule()).shadow(radius: 4).padding(.top, 108)
            }
        }
        .navigationTitle(note?.title ?? "Тетрадь")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { dismissEditor() } label: { Image(systemName: "chevron.backward") }
                    .accessibilityLabel("В библиотеку")
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if exportingPDF { ProgressView().accessibilityLabel("Экспорт PDF") }
                Button { session.undo() } label: { Image(systemName: "arrow.uturn.backward") }.disabled(!session.canUndo || session.readOnly).accessibilityLabel("Отменить штрих").accessibilityIdentifier("writing.undo").keyboardShortcut("z", modifiers: .command)
                Button { session.redo() } label: { Image(systemName: "arrow.uturn.forward") }.disabled(!session.canRedo || session.readOnly).accessibilityLabel("Повторить штрих").keyboardShortcut("z", modifiers: [.command, .shift])
                notebookActionsMenu
            }
        }
        .onAppear {
            store.editingNotebookID = notebookID
            if pageID == nil {
                let saved = UserDefaults.standard.string(forKey: "lastPage.\(notebookID.uuidString)").flatMap(UUID.init(uuidString:))
                pageID = note?.pages.first { $0.id == saved }?.id ?? note?.pages.first?.id
            }
            if let page { render(page) }
            session.refresh()
        }
        .onChange(of: page?.id) { _, _ in
            session.hideHint()
            if let id = page?.id { UserDefaults.standard.set(id.uuidString, forKey: "lastPage.\(notebookID.uuidString)") }
            background = nil
            if let page { render(page) }
            session.canUndo = false
            session.canRedo = false
        }
        .onChange(of: page) { old, new in
            guard let new, let old, new.id == old.id else { return }
            if new.paper != old.paper || new.paperTint != old.paperTint || new.paperTemplateID != old.paperTemplateID || new.paperSpacing != old.paperSpacing || new.paperMargin != old.paperMargin || new.width != old.width || new.height != old.height || new.texts != old.texts || new.images != old.images { render(new) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { session.cancelPendingRecognition?(); store.flush() }
        }
        .onChange(of: session.readOnly) { _, _ in session.hideHint() }
        .onChange(of: session.laserPointer) { _, _ in session.cancelPendingRecognition?(); session.hideHint() }
        .onDisappear {
            store.editingNotebookID = nil
            session.cancelPendingRecognition?(); store.flush(); exportTask?.cancel(); exportTask = nil; exportingPDF = false
            Task { await store.syncPages() }
        }
        .onChange(of: photo) { _, item in
            guard let item, let destinationPage = page else { return }
            isAddingImage = true
            Task {
                defer { isAddingImage = false; photo = nil }
                do {
                    guard let data = try await item.loadTransferable(type: Data.self) else { throw NoteError.invalidFile }
                    guard !session.readOnly else { return }
                    let prepared = try ImageLoader.prepareForStorage(data)
                    let size = prepared.size
                    let frame = try ImageLoader.fittedRect(image: size, page: destinationPage.size)
                    guard (store.notebook(notebookID)?.pages.first { $0.id == destinationPage.id }?.images.count ?? 100) < 100 else { throw NoteError.invalidFile }
                    let asset = try store.storeAsset(prepared.data, extension: prepared.suffix)
                    guard store.updatePage(notebookID, destinationPage.id, {
                        $0.images.append(PageImage(asset: asset, x: Double(frame.minX), y: Double(frame.minY), width: Double(frame.width), height: Double(frame.height)))
                    }) else { throw NoteError.invalidFile }
                    session.resume()
                } catch { store.error = error.localizedDescription }
            }
        }
        .sheet(isPresented: $showPages, onDismiss: { session.resume() }) {
            PageOrganizer(notebookID: notebookID, selectedPage: Binding(get: { page?.id }, set: { pageID = $0 }), readOnly: session.readOnly)
        }
        .sheet(isPresented: $searchingPages, onDismiss: { session.resume() }) {
            NoteSearch(notebookID: notebookID) { _, id in pageID = id }
        }
        .sheet(isPresented: $pageBatch, onDismiss: { session.resume() }) {
            if let page { PageBatchView(sourceID: notebookID, currentPage: page.id, readOnly: session.readOnly) }
        }
        .sheet(isPresented: $workspace, onDismiss: { canvasRevision = UUID(); session.resume() }) {
            if let page { SheetWorkspace(notebookID: notebookID, original: page, readOnly: session.readOnly) }
        }
        .sheet(isPresented: $studyCards, onDismiss: { session.resume() }) {
            if let page { StudySession(notebookID: notebookID, pageID: page.id) }
        }
        .sheet(isPresented: $clockOpen, onDismiss: { session.resume() }) { SessionClock(notebook:notebookID) }
        .sheet(isPresented:$scanning,onDismiss:{ session.resume() }) {
            ScanPages { result in
                scanning = false
                guard let result, let page else { return }
                do { pageID = try store.insertScans(result.get(),in:notebookID,after:page.id) }
                catch { store.error = error.localizedDescription }
            }
        }
        .sheet(isPresented: $sourcePDF, onDismiss: { session.resume() }) {
            if let page, let asset = page.pdfAsset, let url = try? store.assetURL(asset) {
                SourcePDFReader(url: url, index: page.pdfPage ?? 0) { index in
                    if let id = note?.pages.first(where: { $0.pdfAsset == asset && $0.pdfPage == index })?.id {
                        previousPage = pageID; pageID = id
                    }
                }
            }
        }
        .sheet(isPresented: $showWritingSettings, onDismiss: { session.resume() }) { WritingSettingsView(session: session) }
        .sheet(item: $paperRequest, onDismiss: { session.resume() }) { request in
            PaperDesignerView(configuration: PaperConfiguration(page: request.page), canResize: request.canResize, failureInfo: { store.error }) { configuration in
                if request.adding { return addConfiguredPage(configuration, after: request.page.id) }
                do {
                    try store.configurePaper(in: notebookID, pageID: request.page.id, configuration: configuration, resize: request.canResize)
                    return true
                } catch { store.error = error.localizedDescription; return false }
            }
        }
        .sheet(isPresented: $showInkElements, onDismiss: { session.resume() }) {
            InkElementsView(session: session, pageSize: page?.size ?? CGSize(width: 595, height: 842))
        }
        .sheet(isPresented: $showObjects, onDismiss: { session.resume() }) {
            if let page { PageObjectsView(notebookID: notebookID, pageID: page.id) }
        }
        .sheet(item: $shared, onDismiss: { session.resume() }) { ShareSheet(url: $0.url) }
        .alert("Очистить рукопись?", isPresented: $confirmClearInk) {
            Button("Отмена", role: .cancel) { session.resume() }
            Button("Очистить", role: .destructive) {
                if !session.clearInk() { store.error = "Очистка сейчас недоступна. Вернитесь к странице и повторите." }
                store.flush(); session.resume()
            }
        } message: { Text("Удалятся только рукописные штрихи. Бумага, PDF, печатный текст и фото останутся. Очистку можно отменить кнопкой ↶ до смены страницы.") }
        .alert("Инструменты письма", isPresented: $showHelp) {
            Button("Понятно") { session.resume() }
        } message: {
            Text("Внизу экрана расположена системная палитра. Нажмите на ручку или маркер повторно, чтобы выбрать толщину. Цвет меняется цветными кружками. Ластик удаляет штрихи; лассо выделяет рукопись для перемещения и копирования.\n\nУвеличение — двумя пальцами. Если включено рисование пальцем, перемещайте лист двумя пальцами. Для Apple Pencil можно отключить рисование пальцем в меню ⋯. Отмена и повтор относятся к рукописи текущей страницы.")
        }
    }

    private var notebookActionsMenu: some View {
        Menu {
            Button("Найти на страницах", systemImage: "magnifyingglass") { session.prepareForModal(); searchingPages = true }
                .keyboardShortcut("f", modifiers:.command)
            Toggle("Вторая тетрадь рядом",isOn:$referenceOpen)
            if VNDocumentCameraViewController.isSupported {
                Button("Сканировать листы",systemImage:"doc.viewfinder") { session.prepareForModal(); scanning = true }.disabled(session.readOnly)
            }
            Button("Таймер и секундомер", systemImage:"timer") { session.prepareForModal(); clockOpen = true }
            Button("Выделение, объекты и самопроверка", systemImage: "lasso") { session.prepareForModal(); workspace = true }
            Button("Учебные карточки", systemImage: "rectangle.on.rectangle") { session.prepareForModal(); studyCards = true }.disabled(session.readOnly)
            Button("Линейка", systemImage: "ruler") { session.canvas?.isRulerActive.toggle() }.disabled(session.readOnly)
            if page?.pdfAsset != nil {
                Button("Читать исходный PDF", systemImage: "book") { session.prepareForModal(); sourcePDF = true }
            }
            if let previousPage {
                Button("К предыдущему месту", systemImage: "arrow.uturn.left") { pageID = previousPage; self.previousPage = nil }
            }
            Button("Выбрать страницы для переноса или экспорта", systemImage: "doc.on.doc") { session.prepareForModal(); pageBatch = true }
            Button("Письмо и жесты", systemImage: "slider.horizontal.3") { showWritingSettings = true }
            Button("Мои элементы", systemImage: "square.stack") {
                session.cancelPendingRecognition?(); showInkElements = true
            }
            Toggle("Лазерная указка", isOn: $session.laserPointer)
            Button("Печатный текст и изображения", systemImage: "textformat") { showObjects = true }.disabled(session.readOnly)
            PhotosPicker(selection: $photo, matching: .images) { Label("Добавить изображение", systemImage: "photo") }
                .disabled(isAddingImage || session.readOnly)
            Toggle("Рисовать пальцем", isOn: $fingerDrawing)
            if let page, page.pdfAsset == nil {
                        Button("Бумага и макет", systemImage: "rectangle.grid.2x2") { requestPaper(adding: false) }.disabled(session.readOnly)
            }
            if let page {
                        Button("Новый лист с этой бумагой", systemImage: "doc.badge.plus") { addPage(page.paper, keepLayout: true) }.disabled(session.readOnly)
            }
            Button("Очистить рукопись страницы", systemImage: "eraser", role: .destructive) { confirmClearInk = true }
                .disabled(session.readOnly || !session.hasInk)
            Button("Экспортировать PDF", systemImage: "doc.richtext") { exportPDF() }
            Button("Редактируемая копия .listnote", systemImage: "square.and.arrow.up") { exportArchive() }
            Button("Как писать и менять ручки", systemImage: "questionmark.circle") { showHelp = true }
        } label: { Image(systemName: "ellipsis.circle") }.accessibilityLabel("Действия с тетрадью").accessibilityIdentifier("notebook.actions").disabled(exportingPDF)
    }

    private var quickToolsBar: some View {
        HStack(spacing: 4) {
            if showQuickTools {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 2) {
                        ForEach(QuickInk.allCases) { preset in
                            Button { session.usePreset(preset, width: quickPenWidth) } label: {
                                Image(systemName: preset == .yellow ? "highlighter" : "pencil.tip.crop.circle.fill")
                                    .font(.title3).foregroundStyle(Color(uiColor: preset.color))
                                    .frame(width: 44, height: 44)
                            }.accessibilityLabel(preset.title).disabled(session.readOnly)
                        }
                        Button { session.laserPointer.toggle() } label: {
                            Image(systemName: "dot.scope").foregroundStyle(session.laserPointer ? .red : Theme.accent)
                                .frame(width: 44, height: 44)
                        }.accessibilityLabel(session.laserPointer ? "Выключить лазерную указку" : "Лазерная указка").accessibilityIdentifier("writing.laser")
                        Button { session.cancelPendingRecognition?(); showInkElements = true } label: {
                            Image(systemName: "square.stack").frame(width: 44, height: 44)
                        }.accessibilityLabel("Мои элементы")
                        Menu {
                            ForEach([1.0, 2.0, 4.0], id: \.self) { width in
                                Button("\(Int(width)) пт") { quickPenWidth = width }
                            }
                        } label: { Text("\(Int(quickPenWidth))").font(.callout.monospacedDigit()).frame(width: 44, height: 44) }
                            .accessibilityLabel("Толщина быстрых ручек").disabled(session.readOnly)
                    }
                }.frame(height: 44).accessibilityIdentifier("writing.quickTools")
            } else {
                Label(store.hasUnsavedChanges ? "Сохранение…" : "На устройстве", systemImage: store.hasUnsavedChanges ? "clock" : "checkmark.circle")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer(minLength: 0)
            }
            Button { session.readOnly.toggle() } label: {
                Image(systemName: session.readOnly ? "lock.fill" : "pencil.and.outline").frame(width: 44, height: 44)
            }.accessibilityLabel(session.readOnly ? "Включить редактирование" : "Режим чтения").accessibilityIdentifier("writing.readOnly")
            Button { showWritingSettings = true } label: {
                Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44)
            }.accessibilityLabel("Настройки письма и жестов").accessibilityIdentifier("writing.settings")
        }.padding(.horizontal, 10).background(Theme.paper.opacity(0.6))
    }

    private func render(_ page: NotePage) {
        do { background = try PageRenderer.background(page, store: store); renderError = nil }
        catch { background = nil; renderError = error.localizedDescription }
    }
    private func navigate(_ delta: Int) {
        guard let note else { return }
        let next = pageIndex + delta
        guard note.pages.indices.contains(next) else { return }
        store.flush()
        pageID = note.pages[next].id
    }
    private func requestPaper(adding: Bool) {
        guard let page, !session.readOnly, adding || page.pdfAsset == nil else { return }
        session.prepareForModal()
        let emptyInk = page.drawing.isEmpty || (try? PKDrawing(data: page.drawing).strokes.isEmpty) == true
        let canResize = adding || (emptyInk && page.texts.isEmpty && page.images.isEmpty && page.pdfAsset == nil)
        paperRequest = PaperSheetRequest(page: page, adding: adding, canResize: canResize)
    }

    private func addPage(_ paper: PaperStyle, keepLayout: Bool = false) {
        var configuration = page.map(PaperConfiguration.init(page:)) ?? PaperConfiguration()
        configuration.style = paper
        if !keepLayout { configuration.templateID = nil; configuration.legacyLayout = false }
        _ = addConfiguredPage(configuration)
    }

    private func addConfiguredPage(_ configuration: PaperConfiguration, after anchor: UUID? = nil) -> Bool {
        guard (note?.pages.count ?? 0) < 2000 else {
            store.error = "В одной тетради поддерживается до 2000 страниц. Создайте новую тетрадь."
            return false
        }
        guard !session.readOnly else { return false }
        guard let after = anchor ?? page?.id else { return false }
        do {
            pageID = try store.insertPage(in: notebookID, after: after, configuration: configuration)
            return true
        } catch { store.error = error.localizedDescription; return false }
    }
    private func exportPDF() {
        guard let note, !exportingPDF else { return }
        store.flush()
        exportingPDF = true
        exportTask = Task {
            defer { exportingPDF = false }
            do {
                let url = try await PageRenderer.exportPDF(note, store: store)
                guard !Task.isCancelled else { return }
                shared = SharedFile(url: url)
            } catch {
                if !Task.isCancelled { store.error = error.localizedDescription }
            }
        }
    }
    private func exportArchive() {
        guard let note else { return }
        store.flush()
        do { shared = SharedFile(url: try store.exportArchive(note)) }
        catch { store.error = error.localizedDescription }
    }
}

private struct CanvasIdentity: Hashable {
    var pageID: UUID
    var width: Double
    var height: Double
    var revision: UUID
}

struct PageOrganizer: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let notebookID: UUID
    @Binding var selectedPage: UUID?
    var readOnly = false
    @State private var bookmarkedOnly = false
    @State private var headingOnly = false
    @State private var headingPage: UUID?
    @State private var headingDraft = ""
    @State private var deleting: UUID?
    private var note: Notebook? { store.notebook(notebookID) }

    var body: some View {
        NavigationStack {
            List {
                Toggle("Только закладки", isOn: $bookmarkedOnly)
                Toggle("Оглавление по темам", isOn:$headingOnly)
                if let note {
                    ForEach(Array(note.pages.enumerated()).filter { (!bookmarkedOnly || $0.element.bookmarked) && (!headingOnly || $0.element.heading != nil) }, id: \.element.id) { index, page in
                        Button { selectedPage = page.id; dismiss() } label: {
                            HStack {
                                PageThumbnail(page: page)
                                Text(page.heading.map { "\(index + 1). " + $0 } ?? "Страница \(index + 1)").foregroundStyle(.primary)
                                Spacer()
                                if page.bookmarked { Image(systemName: "bookmark.fill") }
                                if selectedPage == page.id { Image(systemName: "checkmark.circle.fill") }
                            }.padding(.vertical, 8)
                        }
                        .contextMenu {
                            Button("Название темы") { headingDraft = page.heading ?? ""; headingPage = page.id }.disabled(readOnly)
                            Button("Дублировать") {
                                var copy = page; copy.id = UUID()
                                store.update(notebookID) { $0.pages.insert(copy, at: index + 1) }
                            }.disabled(readOnly || note.pages.count >= 2000)
                            Button(page.bookmarked ? "Убрать закладку" : "Добавить закладку") { store.updatePage(notebookID, page.id) { $0.bookmarked.toggle() } }
                            Button("Удалить страницу", role: .destructive) { deleting = page.id }.disabled(readOnly || note.pages.count <= 1)
                        }
                    }.onMove { source, destination in
                        guard !bookmarkedOnly, !headingOnly, !readOnly else { return }
                        store.update(notebookID) { $0.pages.move(fromOffsets: source, toOffset: destination) }
                    }.moveDisabled(bookmarkedOnly || headingOnly || readOnly)
                }
            }
            .navigationTitle("Страницы")
            .alert("Название в оглавлении",isPresented:Binding(get:{ headingPage != nil },set:{ if !$0 { headingPage = nil } })) {
                TextField("Тема",text:$headingDraft)
                Button("Сохранить") {
                    if let id = headingPage {
                        let value = headingDraft.trimmingCharacters(in:.whitespacesAndNewlines)
                        store.updatePage(notebookID,id) { $0.heading = value.isEmpty ? nil : String(value.prefix(160)) }
                    }
                    headingPage = nil
                }
                Button("Отмена",role:.cancel) { headingPage = nil }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { EditButton().disabled(bookmarkedOnly || readOnly) }
                ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } }
            }
            .alert("Удалить страницу?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })) {
                Button("Отмена", role: .cancel) { deleting = nil }
                Button("Удалить", role: .destructive) {
                    if let id = deleting, let note, note.pages.count > 1 {
                        store.update(notebookID) { $0.pages.removeAll { $0.id == id } }
                        if selectedPage == id { selectedPage = store.notebook(notebookID)?.pages.first?.id }
                        store.flush()
                    }
                    deleting = nil
                }
            } message: { Text("Действие нельзя отменить. Остальные страницы останутся в тетради.") }
            .onDisappear { store.flush() }
        }
    }
}
