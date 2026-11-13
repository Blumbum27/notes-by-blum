import Foundation
import Combine
import PencilKit
import PDFKit
import UIKit
import CryptoKit

@MainActor
final class LibraryStore: ObservableObject {
    @Published private(set) var library = Library()
    @Published var error: String?
    @Published private(set) var isBusy = false
    @Published private(set) var loadFailed = false
    @Published private(set) var recoveryNotice: String?
    @Published private(set) var hasUnsavedChanges = false
    private let root: URL
    private var syncRunning = false
    @Published var backupStatus = ""
    private var lastBackupDigest: SHA256.Digest?
    var editingNotebookID: UUID?
    @Published private(set) var syncStatus = ""

    func chooseSyncFolder(_ folder: URL) throws {
        guard folder.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
        defer { folder.stopAccessingSecurityScopedResource() }
        let bookmark = try folder.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
        try bookmark.write(to: root.appendingPathComponent("sync-folder.bookmark"), options: .atomic)
        syncStatus = "Папка подключена"
    }

    private struct FullBackup: Codable {
        let version: Int
        let library: Library
        let assets: [String: Data]
    }
    private func fullBackupData() throws -> Data {
        guard !loadFailed else { throw NoteError.invalidFile }
        try Self.validate(library)
        let names = library.notebooks.reduce(into: Set<String>()) { $0.formUnion(referencedAssets($1)) }
        var assets: [String: Data] = [:]
        for name in names { assets[name] = try readAsset(name) }
        return try encoder.encode(FullBackup(version: 1, library: library, assets: assets))
    }
    func exportLibrary() throws -> URL {
        let url = try exportURL(extension: "blumlibrary")
        try fullBackupData().write(to: url, options: .atomic)
        return url
    }
    func restoreFullBackup(_ url: URL) throws {
        guard !loadFailed, !isBusy, library.notebooks.isEmpty, library.folders.isEmpty,
              (library.inkElements ?? []).isEmpty else {
            throw NSError(domain:"Library",code:1,userInfo:[NSLocalizedDescriptionKey:"Полную копию можно восстановить в пустую библиотеку."])
        }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf:url,options:.mappedIfSafe)
        let backup = try JSONDecoder().decode(FullBackup.self,from:data)
        guard backup.version == 1 else { throw NoteError.newerVersion }
        try Self.validate(backup.library)
        let names = backup.library.notebooks.reduce(into:Set<String>()) { $0.formUnion(referencedAssets($1)) }
        guard Set(backup.assets.keys) == names else { throw NoteError.invalidFile }
        var created: [URL] = []
        do {
            for (name, bytes) in backup.assets {
                let target = try assetURL(name)
                if name.lowercased().hasSuffix(".pdf") {
                    guard let doc = PDFDocument(data:bytes), !doc.isLocked else { throw NoteError.invalidFile }
                    for note in backup.library.notebooks {
                        for page in note.pages where page.pdfAsset == name {
                            guard let index = page.pdfPage,index < doc.pageCount else { throw NoteError.invalidFile }
                        }
                    }
                } else { try ImageLoader.validate(bytes) }
                if manager.fileExists(atPath:target.path) { guard try readAsset(name) == bytes else { throw NoteError.invalidFile } }
                else { try bytes.write(to:target,options:.atomic); created.append(target) }
            }
            try commit(backup.library)
        } catch { for file in created { try? manager.removeItem(at:file) }; throw error }
    }
    func chooseBackupFolder(_ url: URL) throws {
        guard url.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
        defer { url.stopAccessingSecurityScopedResource() }
        try url.bookmarkData(options:.minimalBookmark,includingResourceValuesForKeys:nil,relativeTo:nil)
            .write(to:root.appendingPathComponent("backup-folder.bookmark"),options:.atomic)
        lastBackupDigest = nil
        performAutoBackup()
    }
    func performAutoBackup() {
        let marker = root.appendingPathComponent("backup-folder.bookmark")
        guard manager.fileExists(atPath:marker.path), !loadFailed, !isBusy, !library.notebooks.isEmpty,
              flush(), lastBackupDigest != lastKnownDigest else { return }
        do {
            var stale = false
            let folder = try URL(resolvingBookmarkData:Data(contentsOf:marker),options:[],relativeTo:nil,bookmarkDataIsStale:&stale)
            guard folder.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
            defer { folder.stopAccessingSecurityScopedResource() }
            let key = "BlumBackupInstallID"
            let install = UserDefaults.standard.string(forKey:key).flatMap(UUID.init(uuidString:)) ?? UUID()
            UserDefaults.standard.set(install.uuidString,forKey:key)
            let destination = folder.appendingPathComponent("notes-by-Blum-" + install.uuidString + "-" + Date.now.formatted(.iso8601.year().month().day()) + ".blumlibrary")
            try fullBackupData().write(to:destination,options:.atomic)
            lastBackupDigest = lastKnownDigest; backupStatus = "Копия сохранена " + Date().formatted()
        } catch { backupStatus = "Ошибка резервной копии: " + error.localizedDescription }
    }

    func syncPages() async {
        let bookmark = root.appendingPathComponent("sync-folder.bookmark")
        guard manager.fileExists(atPath: bookmark.path), !loadFailed, !isBusy, !syncRunning else { return }
        syncRunning = true
        defer { syncRunning = false }
        do {
            var stale = false
            let folder = try URL(resolvingBookmarkData: Data(contentsOf: bookmark), options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
            guard folder.startAccessingSecurityScopedResource() else { throw CocoaError(.fileReadNoPermission) }
            defer { folder.stopAccessingSecurityScopedResource() }
            if stale { try chooseSyncFolder(folder) }
            let directory = folder.appendingPathComponent("notes-by-Blum-sync", isDirectory: true)
            try manager.createDirectory(at: directory, withIntermediateDirectories: true)
            let entries = try manager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            for entry in entries where entry.pathExtension == "icloud" {
                try? manager.startDownloadingUbiquitousItem(at: entry)
            }
            var ids = Set(library.notebooks.filter { $0.deletedAt == nil }.map(\.id))
            ids.formUnion(entries.filter { $0.pathExtension == "blumsync" }.compactMap { UUID(uuidString: $0.deletingPathExtension().lastPathComponent) })
            for id in ids.sorted(by: { $0.uuidString < $1.uuidString }) {
                try Task.checkCancellation()
                if notebook(id)?.deletedAt != nil { continue }
                try await syncNotebook(id, directory: directory)
            }
            syncStatus = "Проверено в " + Date().formatted(date: .omitted, time: .shortened)
        } catch is CancellationError {} catch { syncStatus = "Синхронизация отложена. " + error.localizedDescription }
    }

    private func syncNotebook(_ id: UUID, directory: URL) async throws {
        let target = directory.appendingPathComponent(id.uuidString + ".blumsync")
        let checkpoint = root.appendingPathComponent("sync-" + id.uuidString + ".json")
        let base = manager.fileExists(atPath: checkpoint.path) ? try JSONDecoder().decode([NotePage].self, from: Data(contentsOf: checkpoint)) : []
        let before = notebook(id)
        var localAssets: [String: Data] = [:]
        if let before { for name in referencedAssets(before) { localAssets[name] = try readAsset(name) } }
        let local = before.map { NotebookArchive(notebook: $0, assets: localAssets) }
        guard let archive = try await Task.detached(priority: .utility, operation: {
            try SyncFile.exchange(target, id: id, base: base, local: local)
        }).value else { return }
        // The editor can receive new strokes while the provider is reading the file.
        guard notebook(id) == before, !loadFailed, !isBusy else { return }
        if editingNotebookID == id && before?.pages != archive.notebook.pages { return }
        try Self.validate(archive.notebook)
        var updated = before ?? archive.notebook
        updated.pages = archive.notebook.pages
        if before == nil { updated.folderID = nil }
        if updated != before {
            for name in referencedAssets(updated) {
                guard let bytes = archive.assets[name] else { throw NoteError.missingAsset(name) }
                let destination = try assetURL(name)
                if manager.fileExists(atPath: destination.path) {
                    guard try readAsset(name) == bytes else { throw NoteError.invalidFile }
                } else {
                    if name.lowercased().hasSuffix(".pdf") {
                        guard let pdf = PDFDocument(data: bytes), !pdf.isLocked else { throw NoteError.invalidFile }
                    } else { try ImageLoader.validate(bytes) }
                    try bytes.write(to: destination, options: .atomic)
                }
            }
            var next = library
            if let index = next.notebooks.firstIndex(where: { $0.id == id }) { next.notebooks[index] = updated }
            else { next.notebooks.append(updated) }
            try commit(next)
        }
        if base != updated.pages { try encoder.encode(updated.pages).write(to: checkpoint, options: .atomic) }
    }
    private let manager = FileManager.default
    private var pendingSave: Task<Void, Never>?
    private var assetPins: [String: Int] = [:]
    private var lastKnownDigest: SHA256.Digest?
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    init(root: URL? = nil) {
        self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Blumbum", isDirectory: true)
        do {
            if try Self.finishInterruptedRecovery(at: self.root) {
                recoveryNotice = "Завершено восстановление, прерванное закрытием приложения. Исходные файлы сохранены отдельно."
            }
            try manager.createDirectory(at: self.root.appendingPathComponent("assets"), withIntermediateDirectories: true)
            let file = self.root.appendingPathComponent("library.json")
            let backup = self.root.appendingPathComponent("library.previous.json")
            if manager.fileExists(atPath: file.path) {
                do {
                    let data = try Data(contentsOf: file, options: .mappedIfSafe)
                    library = try Self.decodeLibrary(data)
                    lastKnownDigest = SHA256.hash(data: data)
                } catch NoteError.newerVersion {
                    throw NoteError.newerVersion
                } catch {
                    // Recover only a fully validated previous snapshot; preserve the broken one.
                    let recovered = try Self.decodeLibrary(Data(contentsOf: backup))
                    let damaged = self.root.appendingPathComponent("library.damaged-\(UUID().uuidString).json")
                    try manager.copyItem(at: file, to: damaged)
                    let restoredData = try encoder.encode(recovered)
                    try restoredData.write(to: file, options: .atomic)
                    lastKnownDigest = SHA256.hash(data: restoredData)
                    library = recovered
                    recoveryNotice = "Библиотека восстановлена из предыдущего сохранения. Последние изменения могли не сохраниться. Экспортируйте важные тетради в .listnote."
                }
            } else if manager.fileExists(atPath: backup.path) {
                let recovered = try Self.decodeLibrary(Data(contentsOf: backup))
                let restoredData = try encoder.encode(recovered)
                try restoredData.write(to: file, options: .atomic)
                lastKnownDigest = SHA256.hash(data: restoredData)
                library = recovered
                recoveryNotice = "Основной файл отсутствовал. Библиотека восстановлена из предыдущего сохранения."
            }
        } catch {
            loadFailed = true
            self.error = "Библиотека не загружена. Исходные файлы сохранены; запись заблокирована. \(error.localizedDescription)"
        }
    }

    private struct VersionHeader: Decodable { var version: Int }
    private struct RecoveryState: Codable { var staging: String; var preserved: String }

    private static func recoveryMarker(for root: URL) -> URL {
        root.deletingLastPathComponent().appendingPathComponent(root.lastPathComponent + ".recovery-state.json")
    }

    private static func finishInterruptedRecovery(at root: URL) throws -> Bool {
        let marker = recoveryMarker(for: root)
        let manager = FileManager.default
        guard manager.fileExists(atPath: marker.path) else { return false }
        let state = try JSONDecoder().decode(RecoveryState.self, from: Data(contentsOf: marker))
        try validateAssetName(state.staging); try validateAssetName(state.preserved)
        guard state.staging.hasPrefix("Blumbum-rebuild-"), state.preserved.hasPrefix(root.lastPathComponent + "-recovery-") else { throw NoteError.invalidFile }
        let parent = root.deletingLastPathComponent()
        let staging = parent.appendingPathComponent(state.staging)
        let preserved = parent.appendingPathComponent(state.preserved)
        if !manager.fileExists(atPath: root.path) {
            if let data = try? Data(contentsOf: staging.appendingPathComponent("library.json")), (try? decodeLibrary(data)) != nil {
                try manager.moveItem(at: staging, to: root)
            } else if manager.fileExists(atPath: preserved.path) {
                try manager.moveItem(at: preserved, to: root)
            } else { throw NoteError.invalidFile }
        }
        try? manager.removeItem(at: marker)
        return true
    }

    private static func checkVersion(_ data: Data) throws {
        guard try JSONDecoder().decode(VersionHeader.self, from: data).version == 1 else { throw NoteError.newerVersion }
    }

    private static func decodeLibrary(_ data: Data) throws -> Library {
        // Read the header before decoding enums/fields that a future version may change.
        try checkVersion(data)
        let value = try JSONDecoder().decode(Library.self, from: data)
        try validate(value)
        return value
    }

    static func validate(_ library: Library, inspectInk: Bool = true) throws {
        guard library.version == 1 else { throw NoteError.newerVersion }
        guard Set(library.notebooks.map(\.id)).count == library.notebooks.count,
              Set(library.folders.map(\.id)).count == library.folders.count else { throw NoteError.invalidFile }
        for note in library.notebooks { try validate(note, inspectInk: inspectInk) }
        let elements = library.inkElements ?? []
        guard elements.count <= 50, Set(elements.map(\.id)).count == elements.count,
              elements.reduce(0, { $0 + $1.drawing.count }) <= 10_000_000 else { throw NoteError.invalidFile }
        for element in elements {
            guard (1...80).contains(element.title.trimmingCharacters(in: .whitespacesAndNewlines).count) else { throw NoteError.invalidFile }
            guard !element.drawing.isEmpty, element.drawing.count <= 1_000_000 else { throw NoteError.invalidFile }
            if inspectInk { _ = try InkElementPlacement.validate(element.drawing) }
        }
    }

    static func validate(_ note: Notebook, inspectInk: Bool = true) throws {
        guard !note.pages.isEmpty, note.pages.count <= 2000,
              !note.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              Set(note.pages.map(\.id)).count == note.pages.count else { throw NoteError.invalidFile }
        for page in note.pages {
            let cards = page.cards ?? []
            guard cards.count <= 1000, Set(cards.map(\.id)).count == cards.count,
                  cards.allSatisfy({ !$0.question.isEmpty && !$0.answer.isEmpty && $0.question.count <= 8000 && $0.answer.count <= 16000 && (0...120).contains($0.intervalDays) }) else { throw NoteError.invalidFile }
            guard (page.heading?.count ?? 0) <= 160, (page.studyCovers?.count ?? 0) <= 500,
                  (page.studyCovers ?? []).allSatisfy({ !$0.rect.isEmpty && CGRect(origin: .zero, size: page.size).contains($0.rect) }) else { throw NoteError.invalidFile }
            if let spacing = page.paperSpacing { guard spacing.isFinite, (16...48).contains(spacing) else { throw NoteError.invalidFile } }
            if let margin = page.paperMargin { guard margin.isFinite, (16...64).contains(margin) else { throw NoteError.invalidFile } }
            if let id = page.paperTemplateID { guard !id.isEmpty, id.count <= 80 else { throw NoteError.invalidFile } }
            guard (page.pdfAsset == nil) == (page.pdfPage == nil) else { throw NoteError.invalidFile }
            if let asset = page.pdfAsset {
                try validateAssetName(asset)
                guard (asset as NSString).pathExtension.lowercased() == "pdf", (page.pdfPage ?? -1) >= 0 else { throw NoteError.invalidFile }
            }
            for image in page.images {
                try validateAssetName(image.asset)
                guard ["jpg", "png"].contains((image.asset as NSString).pathExtension.lowercased()) else { throw NoteError.invalidFile }
            }
            guard page.width.isFinite, page.height.isFinite,
                  (100...5000).contains(page.width), (100...5000).contains(page.height),
                  page.width * page.height <= 4_000_000,
                  page.drawing.count <= 30_000_000, page.texts.count <= 500, page.images.count <= 100,
                  Set(page.texts.map(\.id)).count == page.texts.count,
                  Set(page.images.map(\.id)).count == page.images.count,
                  page.texts.allSatisfy({ $0.x.isFinite && $0.y.isFinite && abs($0.x) <= 5000 && abs($0.y) <= 5000 && $0.text.count <= 100_000 && $0.fontSize.isFinite && (8...96).contains($0.fontSize) }),
                  page.images.allSatisfy({ $0.x.isFinite && $0.y.isFinite && abs($0.x) <= 5000 && abs($0.y) <= 5000 && $0.width.isFinite && $0.height.isFinite && (1...5000).contains($0.width) && (1...5000).contains($0.height) }) else { throw NoteError.invalidFile }
            if inspectInk && !page.drawing.isEmpty { _ = try PKDrawing(data: page.drawing) }
        }
    }

    func notebook(_ id: UUID) -> Notebook? { library.notebooks.first { $0.id == id } }

    func create(title: String, paper: PaperStyle, color: String, tint: PaperTint = .white, premium: Bool) throws -> UUID {
        try create(title: title, color: color, configuration: PaperConfiguration(style: paper, tint: tint), premium: premium)
    }

    func create(title: String, color: String, configuration: PaperConfiguration, premium: Bool) throws -> UUID {
        guard !loadFailed else { throw NoteError.invalidFile }
        guard premium || library.notebooks.count < 3 else { throw NoteError.limitReached }
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw NoteError.emptyTitle }
        let note = Notebook(title: title, color: color, pages: [configuration.makePage()])
        var next = library
        next.notebooks.insert(note, at: 0)
        try commit(next)
        return note.id
    }

    @discardableResult
    func update(_ id: UUID, _ change: (inout Notebook) -> Void) -> Bool {
        guard !loadFailed, let index = library.notebooks.firstIndex(where: { $0.id == id }) else { return false }
        var changed = library.notebooks[index]
        change(&changed)
        if changed == library.notebooks[index] { return true }
        do { try Self.validate(changed, inspectInk: false) }
        catch { self.error = "Изменение не сохранено: недопустимый размер или содержимое страницы."; return false }
        changed.updatedAt = Date()
        library.notebooks[index] = changed
        hasUnsavedChanges = true
        scheduleSave()
        return true
    }

    @discardableResult
    func updatePage(_ noteID: UUID, _ pageID: UUID, _ change: (inout NotePage) -> Void) -> Bool {
        guard notebook(noteID)?.pages.contains(where: { $0.id == pageID }) == true else { return false }
        return update(noteID) { note in
            guard let index = note.pages.firstIndex(where: { $0.id == pageID }) else { return }
            change(&note.pages[index])
        }
    }

    func replacePage(in id: UUID, expected: NotePage, with replacement: NotePage) throws {
        var next = library
        guard !loadFailed, replacement.id == expected.id,
              let n = next.notebooks.firstIndex(where: { $0.id == id }),
              let p = next.notebooks[n].pages.firstIndex(of: expected) else { throw NoteError.invalidFile }
        next.notebooks[n].pages[p] = replacement
        next.notebooks[n].updatedAt = Date()
        try Self.validate(next.notebooks[n], inspectInk: true)
        try commit(next)
    }

    func addFolder(_ title: String) throws {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw NoteError.emptyTitle }
        var next = library
        next.folders.append(NoteFolder(title: title))
        try commit(next)
    }

    func saveInkElement(title: String, drawing: Data) throws {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...80).contains(title.count) else { throw NoteError.emptyTitle }
        _ = try InkElementPlacement.validate(drawing)
        let elements = library.inkElements ?? []
        guard elements.count < 50, elements.reduce(drawing.count, { $0 + $1.drawing.count }) <= 10_000_000 else {
            throw NSError(domain: "Blumbum", code: 3, userInfo: [NSLocalizedDescriptionKey: "Полка элементов заполнена: до 50 элементов и 10 МБ рукописи. Удалите ненужный элемент."])
        }
        var next = library
        next.inkElements = elements + [InkElement(title: title, drawing: drawing)]
        try commit(next)
    }

    func deleteInkElement(_ id: UUID) throws {
        var next = library
        next.inkElements?.removeAll { $0.id == id }
        try commit(next)
    }

    func transferPages(_ ids: Set<UUID>, from source: UUID, to destination: UUID, before anchor: UUID?, move: Bool) throws {
        var next = library
        guard source != destination, !ids.isEmpty,
              let a = next.notebooks.firstIndex(where: { $0.id == source && $0.deletedAt == nil }),
              let b = next.notebooks.firstIndex(where: { $0.id == destination && $0.deletedAt == nil }) else { throw NoteError.invalidFile }
        var pages = next.notebooks[a].pages.filter { ids.contains($0.id) }
        guard pages.count == ids.count, pages.count + next.notebooks[b].pages.count <= 2000 else { throw NoteError.invalidFile }
        let position: Int
        if let anchor {
            guard let index = next.notebooks[b].pages.firstIndex(where: { $0.id == anchor }) else { throw NoteError.invalidFile }
            position = index
        } else { position = next.notebooks[b].pages.count }
        if move {
            next.notebooks[a].pages.removeAll { ids.contains($0.id) }
            if next.notebooks[a].pages.isEmpty { next.notebooks[a].pages = [NotePage()] }
            next.notebooks[a].updatedAt = Date()
        }
        for index in pages.indices { pages[index].id = UUID() }
        next.notebooks[b].pages.insert(contentsOf: pages, at: position)
        next.notebooks[b].updatedAt = Date()
        try commit(next)
    }

    func insertPage(in noteID: UUID, after pageID: UUID, configuration: PaperConfiguration) throws -> UUID {
        guard let noteIndex = library.notebooks.firstIndex(where: { $0.id == noteID }),
              let pageIndex = library.notebooks[noteIndex].pages.firstIndex(where: { $0.id == pageID }),
              library.notebooks[noteIndex].pages.count < 2000 else { throw NoteError.invalidFile }
        let page = configuration.makePage()
        var next = library
        next.notebooks[noteIndex].pages.insert(page, at: pageIndex + 1)
        next.notebooks[noteIndex].updatedAt = Date()
        try Self.validate(next.notebooks[noteIndex], inspectInk: false)
        try commit(next)
        return page.id
    }
    func insertScans(_ scans: [UIImage], in id: UUID, after pageID: UUID) throws -> UUID {
        guard !scans.isEmpty, let n = library.notebooks.firstIndex(where:{ $0.id == id }),
              let anchor = library.notebooks[n].pages.firstIndex(where:{ $0.id == pageID }),
              scans.count + library.notebooks[n].pages.count <= 2000 else { throw NoteError.invalidFile }
        var files: [URL] = []
        do {
            let pages = try scans.map { image -> NotePage in
                guard let raw = image.jpegData(compressionQuality:0.85) else { throw NoteError.invalidFile }
                let prepared = try ImageLoader.prepareForStorage(raw)
                let asset = try storeAsset(prepared.data,extension:prepared.suffix)
                files.append(try assetURL(asset))
                var page = NotePage(paper:.blank)
                let box = try ImageLoader.fittedRect(image:prepared.size,page:page.size)
                page.images = [PageImage(asset:asset,x:box.minX,y:box.minY,width:box.width,height:box.height)]
                return page
            }
            var next = library
            next.notebooks[n].pages.insert(contentsOf:pages,at:anchor+1)
            next.notebooks[n].updatedAt = Date()
            try commit(next)
            return pages[0].id
        } catch { for url in files { try? manager.removeItem(at:url) }; throw error }
    }

    func configurePaper(in noteID: UUID, pageID: UUID, configuration: PaperConfiguration, resize: Bool) throws {
        guard let noteIndex = library.notebooks.firstIndex(where: { $0.id == noteID }),
              let pageIndex = library.notebooks[noteIndex].pages.firstIndex(where: { $0.id == pageID }) else { throw NoteError.invalidFile }
        let page = library.notebooks[noteIndex].pages[pageIndex]
        guard page.pdfAsset == nil else { throw NoteError.invalidFile }
        if resize, page.size != configuration.size {
            var emptyInk = page.drawing.isEmpty
            if !emptyInk { emptyInk = try PKDrawing(data: page.drawing).strokes.isEmpty }
            guard emptyInk && page.texts.isEmpty && page.images.isEmpty else { throw NoteError.invalidFile }
        }
        var next = library
        configuration.apply(to: &next.notebooks[noteIndex].pages[pageIndex], resize: resize)
        next.notebooks[noteIndex].updatedAt = Date()
        try Self.validate(next.notebooks[noteIndex], inspectInk: false)
        try commit(next)
    }

    func deletePermanently(_ id: UUID) throws {
        var next = library
        next.notebooks.removeAll { $0.id == id && $0.deletedAt != nil }
        try commit(next)
        do { try collectUnusedAssets() }
        catch { self.error = "Тетрадь удалена, но очистить неиспользуемые вложения не удалось: \(error.localizedDescription)" }
    }

    func duplicate(_ id: UUID, premium: Bool) throws {
        guard premium || library.notebooks.count < 3 else { throw NoteError.limitReached }
        guard var note = notebook(id) else { return }
        note.id = UUID()
        note.title += " — копия"
        note.createdAt = Date()
        note.updatedAt = Date()
        note.deletedAt = nil
        note.pages = note.pages.map { page in var page = page; page.id = UUID(); return page }
        var next = library
        next.notebooks.insert(note, at: 0)
        try commit(next)
    }

    private func scheduleSave() {
        pendingSave?.cancel()
        pendingSave = Task { [weak self] in
            do { try await Task.sleep(for: .milliseconds(350)) } catch { return }
            self?.flush()
        }
    }

    @discardableResult
    func flush() -> Bool {
        pendingSave?.cancel()
        guard !loadFailed else { return false }
        guard hasUnsavedChanges || !manager.fileExists(atPath: root.appendingPathComponent("library.json").path) else { return true }
        do { try persist(library); hasUnsavedChanges = false; return true }
        catch { self.error = "Изменения пока не записаны на диск. \(error.localizedDescription)"; return false }
    }

    private func persist(_ value: Library) throws {
        guard !loadFailed else { throw NoteError.invalidFile }
        // All external ink is checked at load/import; native updates check metadata on entry.
        // Avoid decoding every notebook and saved element after each completed pen stroke.
        try Self.validate(value, inspectInk: false)
        let data = try encoder.encode(value)
        let file = root.appendingPathComponent("library.json")
        if manager.fileExists(atPath: file.path) {
            let old = try Data(contentsOf: file, options: .mappedIfSafe)
            let digest = SHA256.hash(data: old)
            // Known bytes have already passed full validation. An unexpected file change
            // must pass full ink/schema validation before it can replace a good backup.
            if digest != lastKnownDigest { _ = try Self.decodeLibrary(old) }
            if old != data {
                try old.write(to: root.appendingPathComponent("library.previous.json"), options: .atomic)
            }
        }
        try data.write(to: file, options: .atomic)
        lastKnownDigest = SHA256.hash(data: data)
    }

    private func commit(_ value: Library) throws {
        try persist(value)
        pendingSave?.cancel()
        library = value
        hasUnsavedChanges = false
    }

    func assetURL(_ name: String) throws -> URL {
        try Self.validateAssetName(name)
        return root.appendingPathComponent("assets").appendingPathComponent(name)
    }

    static func validateAssetName(_ name: String) throws {
        guard !name.contains(".."), name.range(of: #"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$"#, options: .regularExpression) != nil else { throw NoteError.invalidFile }
    }

    func pinAssets(_ names: Set<String>) { for name in names { assetPins[name, default: 0] += 1 } }
    func unpinAssets(_ names: Set<String>) {
        for name in names {
            if let count = assetPins[name], count > 1 { assetPins[name] = count - 1 }
            else { assetPins.removeValue(forKey: name) }
        }
    }

    func readAsset(_ name: String) throws -> Data {
        let url = try assetURL(name)
        guard manager.fileExists(atPath: url.path) else { throw NoteError.missingAsset(name) }
        return try Data(contentsOf: url, options: .mappedIfSafe)
    }

    func storeAsset(_ data: Data, extension suffix: String) throws -> String {
        guard !loadFailed, ["pdf", "jpg", "png"].contains(suffix) else { throw NoteError.invalidFile }
        let name = UUID().uuidString + "." + suffix
        try data.write(to: assetURL(name), options: .atomic)
        return name
    }

    func importDocument(_ url: URL, premium: Bool) async {
        guard !isBusy, !loadFailed else { return }
        isBusy = true
        defer { isBusy = false }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            guard premium || library.notebooks.count < 3 else { throw NoteError.limitReached }
            let values = try url.resourceValues(forKeys: [.fileSizeKey])
            guard (values.fileSize ?? 0) <= 100_000_000 else {
                throw NSError(domain: "Blumbum", code: 1, userInfo: [NSLocalizedDescriptionKey: "Лимит импорта — 100 МБ."])
            }
            if url.pathExtension.lowercased() == "listnote" {
                let data = try Data(contentsOf: url, options: .mappedIfSafe)
                guard data.count <= 100_000_000 else { throw NoteError.invalidFile }
                try importArchive(data)
                return
            }
            if ["jpg","jpeg","png","heic","heif","tiff","webp"].contains(url.pathExtension.lowercased()) {
                let image = try ImageLoader.prepareForStorage(Data(contentsOf:url,options:.mappedIfSafe))
                let asset = try storeAsset(image.data,extension:image.suffix)
                do {
                    var page = NotePage(paper:.blank)
                    let rect = try ImageLoader.fittedRect(image:image.size,page:page.size)
                    page.images = [PageImage(asset:asset,x:rect.minX,y:rect.minY,width:rect.width,height:rect.height)]
                    var next = library
                    next.notebooks.insert(Notebook(title:url.deletingPathExtension().lastPathComponent,pages:[page]),at:0)
                    try commit(next)
                } catch { if let file = try? assetURL(asset) { try? manager.removeItem(at:file) }; throw error }
                return
            }
            guard let pdf = PDFDocument(url: url), !pdf.isLocked, (1...500).contains(pdf.pageCount),
                  let data = pdf.dataRepresentation() else { throw NoteError.invalidFile }
            var pages: [NotePage] = []
            // Validate all pages before adding the notebook to the library.
            for index in 0..<pdf.pageCount {
                try Task.checkCancellation()
                guard let page = pdf.page(at: index), let reference = page.pageRef else { throw NoteError.invalidFile }
                // Use the same raw box and intrinsic rotation as the Core Graphics renderer.
                let rect = reference.getBoxRect(.mediaBox)
                let rotation = ((Int(reference.rotationAngle) % 360) + 360) % 360
                let rotated = rotation == 90 || rotation == 270
                let width = rotated ? rect.height : rect.width
                let height = rotated ? rect.width : rect.height
                guard width.isFinite, height.isFinite, width > 0, height > 0 else { throw NoteError.invalidFile }
                let fittedWidth: Double = 595
                let fittedHeight = fittedWidth * height / width
                guard (100...5000).contains(fittedHeight) else { throw NoteError.invalidFile }
                pages.append(NotePage(paper: .blank, width: fittedWidth, height: fittedHeight, pdfPage: index))
                if index % 10 == 0 { await Task.yield() }
            }
            // Another UI action may have created a notebook while PDF import yielded.
            guard premium || library.notebooks.count < 3 else { throw NoteError.limitReached }
            let asset = try storeAsset(data, extension: "pdf")
            var committed = false
            defer { if !committed, let url = try? assetURL(asset) { try? manager.removeItem(at: url) } }
            for index in pages.indices { pages[index].pdfAsset = asset }
            let importedTitle = url.deletingPathExtension().lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
            let note = Notebook(title: importedTitle.isEmpty ? "Импортированный PDF" : importedTitle, pages: pages)
            var next = library
            next.notebooks.insert(note, at: 0)
            try commit(next)
            committed = true
        } catch { self.error = error.localizedDescription }
    }

    /// Build a valid replacement first. Quarantine the whole original container;
    /// never reset an unreadable library by deleting its files.
    func restoreBlockedLibrary(from url: URL) async {
        guard loadFailed, !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        let parent = root.deletingLastPathComponent()
        let staging = parent.appendingPathComponent("Blumbum-rebuild-\(UUID().uuidString)", isDirectory: true)
        let preserved = parent.appendingPathComponent(root.lastPathComponent + "-recovery-\(UUID().uuidString)", isDirectory: true)
        let marker = Self.recoveryMarker(for: root)
        var transactionStarted = false
        do {
            guard url.pathExtension.lowercased() == "listnote" else { throw NoteError.invalidFile }
            let replacement = LibraryStore(root: staging)
            await replacement.importDocument(url, premium: true)
            guard !replacement.loadFailed, replacement.error == nil, replacement.library.notebooks.count == 1 else {
                throw NSError(domain: "Blumbum", code: 5, userInfo: [NSLocalizedDescriptionKey: replacement.error ?? "Не удалось прочитать резервную копию."])
            }
            let readyData = try Data(contentsOf: staging.appendingPathComponent("library.json"))
            try encoder.encode(RecoveryState(staging: staging.lastPathComponent, preserved: preserved.lastPathComponent)).write(to: marker, options: .atomic)
            transactionStarted = true
            try manager.moveItem(at: root, to: preserved)
            do { try manager.moveItem(at: staging, to: root) }
            catch {
                try manager.moveItem(at: preserved, to: root)
                throw error
            }
            library = replacement.library
            lastKnownDigest = SHA256.hash(data: readyData)
            loadFailed = false; hasUnsavedChanges = false; self.error = nil
            recoveryNotice = "Восстановлена тетрадь из .listnote. Исходная недоступная библиотека с вложениями сохранена отдельно в контейнере приложения и не удалена. Остальные тетради можно импортировать из их резервных копий."
        } catch { self.error = "Восстановление не выполнено. Исходные данные сохранены. \(error.localizedDescription)" }
        // Staging contains only a newly decoded import, never original user data.
        if manager.fileExists(atPath: root.path) || !transactionStarted {
            if transactionStarted { try? manager.removeItem(at: marker) }
            if manager.fileExists(atPath: staging.path) { try? manager.removeItem(at: staging) }
        }
    }

    private func referencedAssets(_ note: Notebook) -> Set<String> {
        Set(note.pages.flatMap { page in page.images.map(\.asset) + [page.pdfAsset].compactMap { $0 } })
    }

    func exportArchive(_ note: Notebook) throws -> URL {
        try Self.validate(note)
        let assets = try Dictionary(uniqueKeysWithValues: referencedAssets(note).map { ($0, try readAsset($0)) })
        let archive = NotebookArchive(notebook: note, assets: assets)
        let url = try exportURL(extension: "listnote")
        let data = try encoder.encode(archive)
        guard data.count <= 100_000_000 else {
            throw NSError(domain: "Blumbum", code: 2, userInfo: [NSLocalizedDescriptionKey: "Редактируемая копия превышает 100 МБ. Разделите тетрадь на несколько частей перед переносом."])
        }
        try data.write(to: url, options: .atomic)
        return url
    }

    private func importArchive(_ data: Data) throws {
        try Self.checkVersion(data)
        var archive = try JSONDecoder().decode(NotebookArchive.self, from: data)
        guard archive.version == 1 else { throw NoteError.newerVersion }
        try Self.validate(archive.notebook)
        let referenced = referencedAssets(archive.notebook)
        guard referenced.isSubset(of: Set(archive.assets.keys)) else { throw NoteError.invalidFile }
        var names: [String: String] = [:]
        var committed = false
        defer {
            if !committed { for name in names.values { if let url = try? assetURL(name) { try? manager.removeItem(at: url) } } }
        }
        for name in referenced.sorted() {
            _ = try assetURL(name)
            guard let data = archive.assets[name] else { throw NoteError.invalidFile }
            let suffix = (name as NSString).pathExtension.lowercased()
            guard ["pdf", "jpg", "png"].contains(suffix) else { throw NoteError.invalidFile }
            if suffix == "pdf" {
                guard let pdf = PDFDocument(data: data), !pdf.isLocked else { throw NoteError.invalidFile }
                for page in archive.notebook.pages where page.pdfAsset == name {
                    guard let index = page.pdfPage, index >= 0, index < pdf.pageCount else { throw NoteError.invalidFile }
                }
            } else { try ImageLoader.validate(data) }
            names[name] = try storeAsset(data, extension: suffix)
        }
        archive.notebook.id = UUID()
        archive.notebook.folderID = nil
        archive.notebook.deletedAt = nil
        archive.notebook.updatedAt = Date()
        for index in archive.notebook.pages.indices {
            archive.notebook.pages[index].id = UUID()
            if let name = archive.notebook.pages[index].pdfAsset { archive.notebook.pages[index].pdfAsset = names[name] }
            for imageIndex in archive.notebook.pages[index].images.indices {
                let old = archive.notebook.pages[index].images[imageIndex].asset
                guard let renamed = names[old] else { throw NoteError.invalidFile }
                archive.notebook.pages[index].images[imageIndex].asset = renamed
            }
        }
        var next = library
        next.notebooks.insert(archive.notebook, at: 0)
        try commit(next)
        committed = true
    }

    /// Keep everything referenced by current, previous and damaged snapshots.
    /// Never delete files when any snapshot cannot be read and its references are unknown.
    func collectUnusedAssets() throws {
        guard !loadFailed, !isBusy else { return }
        let snapshots = try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasPrefix("library.") && $0.pathExtension == "json" }
        var retained = library.notebooks.reduce(into: Set<String>()) { $0.formUnion(referencedAssets($1)) }
        retained.formUnion(assetPins.keys)
        for url in snapshots {
            guard let data = try? Data(contentsOf: url),
                  let saved = try? JSONDecoder().decode(Library.self, from: data),
                  (try? Self.validate(saved, inspectInk: false)) != nil else { return }
            for note in saved.notebooks { retained.formUnion(referencedAssets(note)) }
        }
        let assets = root.appendingPathComponent("assets", isDirectory: true)
        for file in try manager.contentsOfDirectory(at: assets, includingPropertiesForKeys: [.isRegularFileKey]) {
            // Restrict deletion to regular children of the known asset directory.
            if !retained.contains(file.lastPathComponent),
               try file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
                try manager.removeItem(at: file)
            }
        }
    }

    func dismissRecoveryNotice() { recoveryNotice = nil }

    func performMaintenance() {
        do { try collectUnusedAssets() }
        catch { self.error = "Не удалось освободить место для неиспользуемых файлов: \(error.localizedDescription)" }
        // Temporary share copies are not backups; user-saved Files copies live elsewhere.
        try? Self.cleanExpiredExports()
    }

    static func cleanExpiredExports(at directory: URL? = nil, now: Date = Date()) throws {
        let directory = directory ?? FileManager.default.temporaryDirectory.appendingPathComponent("BlumbumExports", isDirectory: true)
        guard FileManager.default.fileExists(atPath: directory.path) else { return }
        for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isRegularFileKey, .contentModificationDateKey]) {
            let values = try file.resourceValues(forKeys: [.isRegularFileKey, .contentModificationDateKey])
            guard values.isRegularFile == true, file.lastPathComponent.hasPrefix("Blumbum-"),
                  ["pdf", "listnote"].contains(file.pathExtension), let date = values.contentModificationDate,
                  now.timeIntervalSince(date) > 7 * 24 * 60 * 60 else { continue }
            try FileManager.default.removeItem(at: file)
        }
    }

    func exportURL(extension suffix: String) throws -> URL {
        let directory = manager.temporaryDirectory.appendingPathComponent("BlumbumExports", isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("Blumbum-\(UUID().uuidString).\(suffix)")
    }
}
