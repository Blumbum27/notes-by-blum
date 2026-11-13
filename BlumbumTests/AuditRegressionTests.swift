import XCTest
import UIKit
import PencilKit
import PDFKit
@testable import Blumbum

@MainActor
final class AuditRegressionTests: XCTestCase {
    private func directory() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return root
    }
    private func drawing() -> PKDrawing {
        let path = PKStrokePath(controlPoints: [CGPoint(x: 40, y: 40), CGPoint(x: 120, y: 90)].enumerated().map { i,p in
            PKStrokePoint(location: p, timeOffset: Double(i) * 0.1, size: CGSize(width: 3, height: 3), opacity: 1, force: 0.5, azimuth: 0, altitude: .pi / 2)
        }, creationDate: Date())
        return PKDrawing(strokes: [PKStroke(ink: PKInk(.pen, color: .black), path: path, transform: .identity, mask: nil)])
    }

    func testMissingPrimaryRestoresPreviousSnapshot() throws {
        let root = try directory(); let store = LibraryStore(root: root)
        let id = try store.create(title: "Резервная версия", paper: .blank, color: "teal", premium: false)
        store.update(id) { $0.title = "Последняя версия" }; XCTAssertTrue(store.flush())
        try FileManager.default.removeItem(at: root.appendingPathComponent("library.json"))
        let reopened = LibraryStore(root: root)
        XCTAssertFalse(reopened.loadFailed)
        XCTAssertEqual(reopened.notebook(id)?.title, "Резервная версия")
        XCTAssertNotNil(reopened.recoveryNotice)
    }

    func testBlockedLibraryRecoveryPreservesOriginalFiles() async throws {
        let base = try directory()
        let originalRoot = base.appendingPathComponent("blocked")
        try FileManager.default.createDirectory(at: originalRoot, withIntermediateDirectories: true)
        let corrupt = Data("unreadable library".utf8)
        try corrupt.write(to: originalRoot.appendingPathComponent("library.json"))
        let blocked = LibraryStore(root: originalRoot); XCTAssertTrue(blocked.loadFailed)
        let source = LibraryStore(root: base.appendingPathComponent("source"))
        let id = try source.create(title: "Восстановленная", paper: .blank, color: "teal", premium: false)
        let backup = try source.exportArchive(XCTUnwrap(source.notebook(id)))
        addTeardownBlock { try? FileManager.default.removeItem(at: backup) }
        await blocked.restoreBlockedLibrary(from: backup)
        XCTAssertFalse(blocked.loadFailed)
        XCTAssertEqual(blocked.library.notebooks.first?.title, "Восстановленная")
        let preserved = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: base, includingPropertiesForKeys: nil).first { $0.lastPathComponent.hasPrefix("blocked-recovery-") })
        XCTAssertEqual(try Data(contentsOf: preserved.appendingPathComponent("library.json")), corrupt)
    }

    func testInterruptedDirectoryReplacementCompletesOnNextLaunch() throws {
        let base = try directory()
        let root = base.appendingPathComponent("blocked")
        let staging = base.appendingPathComponent("Blumbum-rebuild-test")
        let preserved = base.appendingPathComponent("blocked-recovery-test")
        let staged = LibraryStore(root: staging)
        _ = try staged.create(title: "После прерывания", paper: .blank, color: "teal", premium: false)
        try FileManager.default.createDirectory(at: preserved, withIntermediateDirectories: true)
        let original = Data("original bytes".utf8)
        try original.write(to: preserved.appendingPathComponent("library.json"))
        let marker = base.appendingPathComponent("blocked.recovery-state.json")
        try JSONSerialization.data(withJSONObject: ["staging": staging.lastPathComponent, "preserved": preserved.lastPathComponent]).write(to: marker)
        let reopened = LibraryStore(root: root)
        XCTAssertFalse(reopened.loadFailed)
        XCTAssertEqual(reopened.library.notebooks.first?.title, "После прерывания")
        XCTAssertEqual(try Data(contentsOf: preserved.appendingPathComponent("library.json")), original)
        XCTAssertFalse(FileManager.default.fileExists(atPath: marker.path))
    }

    func testInvalidRecoveryArchiveNeverMovesOriginalLibrary() async throws {
        let root = try directory()
        let corrupt = Data("original corrupt bytes".utf8)
        try corrupt.write(to: root.appendingPathComponent("library.json"))
        let blocked = LibraryStore(root: root)
        let invalid = root.appendingPathComponent("invalid.listnote"); try Data("not a backup".utf8).write(to: invalid)
        await blocked.restoreBlockedLibrary(from: invalid)
        XCTAssertTrue(blocked.loadFailed)
        XCTAssertEqual(try Data(contentsOf: root.appendingPathComponent("library.json")), corrupt)
    }

    func testExportCleanupOnlyRemovesOldGeneratedRegularFiles() throws {
        let root = try directory(); let now = Date()
        let old = root.appendingPathComponent("Blumbum-old.pdf")
        let fresh = root.appendingPathComponent("Blumbum-fresh.listnote")
        let unrelated = root.appendingPathComponent("my-notes.pdf")
        for file in [old, fresh, unrelated] { try Data("test".utf8).write(to: file) }
        for file in [old, unrelated] { try FileManager.default.setAttributes([.modificationDate: now.addingTimeInterval(-8 * 24 * 60 * 60)], ofItemAtPath: file.path) }
        try LibraryStore.cleanExpiredExports(at: root, now: now)
        XCTAssertFalse(FileManager.default.fileExists(atPath: old.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: fresh.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: unrelated.path))
    }

    func testUnexpectedCorruptInkCannotOverwriteAGoodBackupDuringAutosave() throws {
        let root = try directory(); let store = LibraryStore(root: root)
        let id = try store.create(title: "Исходная", paper: .blank, color: "teal", premium: false)
        store.update(id) { $0.title = "Сохранённая" }; XCTAssertTrue(store.flush())
        let backup = root.appendingPathComponent("library.previous.json")
        let originalBackup = try Data(contentsOf: backup)
        var corrupt = store.library
        corrupt.notebooks[0].pages[0].drawing = Data("corrupt PencilKit bytes".utf8)
        let corruptData = try JSONEncoder().encode(corrupt)
        let primary = root.appendingPathComponent("library.json"); try corruptData.write(to: primary)
        store.update(id) { $0.title = "Ещё одно изменение" }
        XCTAssertFalse(store.flush())
        XCTAssertTrue(store.hasUnsavedChanges)
        XCTAssertEqual(try Data(contentsOf: backup), originalBackup)
        XCTAssertEqual(try Data(contentsOf: primary), corruptData)
    }

    func testFutureHeaderBlocksFallbackEvenWhenFuturePayloadCannotDecode() throws {
        let root = try directory(); let store = LibraryStore(root: root)
        let id = try store.create(title: "Старая", paper: .blank, color: "teal", premium: false)
        store.update(id) { $0.title = "Новая" }; store.flush()
        let future = Data(#"{"version":999,"notebooks":"a future schema"}"#.utf8)
        let file = root.appendingPathComponent("library.json"); try future.write(to: file)
        let reopened = LibraryStore(root: root)
        XCTAssertTrue(reopened.loadFailed)
        XCTAssertFalse(reopened.flush())
        XCTAssertEqual(try Data(contentsOf: file), future)
    }

    func testFailedArchiveImportRollsBackAlreadyWrittenAssets() async throws {
        let root = try directory(); let store = LibraryStore(root: root)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { c in
            UIColor.red.setFill(); c.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        var note = Notebook(title: "Повреждённая копия")
        note.pages[0].images = [PageImage(asset: "a.png"), PageImage(asset: "z.png")]
        let archive = NotebookArchive(notebook: note, assets: ["a.png": try XCTUnwrap(image.pngData()), "z.png": Data("invalid png".utf8)])
        let file = root.appendingPathComponent("input.listnote"); try JSONEncoder().encode(archive).write(to: file)
        await store.importDocument(file, premium: false)
        XCTAssertNotNil(store.error)
        XCTAssertTrue(store.library.notebooks.isEmpty)
        XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent("assets").path).isEmpty)
    }

    func testCleanupRetainsAllConcurrentReadersUntilTheirLastRelease() throws {
        let store = LibraryStore(root: try directory())
        let name = try store.storeAsset(Data("temporary asset".utf8), extension: "png")
        let names: Set<String> = [name]
        store.pinAssets(names); store.pinAssets(names)
        try store.collectUnusedAssets()
        store.unpinAssets(names); try store.collectUnusedAssets()
        XCTAssertTrue(FileManager.default.fileExists(atPath: try store.assetURL(name).path))
        store.unpinAssets(names); try store.collectUnusedAssets()
        XCTAssertFalse(FileManager.default.fileExists(atPath: try store.assetURL(name).path))
    }

    func testTransparentPNGStaysTransparentAndShortPagePlacementFits() throws {
        let format = UIGraphicsImageRendererFormat(); format.opaque = false
        let image = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20), format: format).image { c in
            UIColor.red.setFill(); c.fill(CGRect(x: 8, y: 8, width: 10, height: 10))
        }
        let prepared = try ImageLoader.prepareForStorage(XCTUnwrap(image.pngData()))
        XCTAssertEqual(prepared.suffix, "png")
        let alpha = try XCTUnwrap(UIImage(data: prepared.data)?.cgImage).alphaInfo
        XCTAssertTrue([CGImageAlphaInfo.first, .last, .premultipliedFirst, .premultipliedLast].contains(alpha))
        let rect = try ImageLoader.fittedRect(image: CGSize(width: 2000, height: 1000), page: CGSize(width: 595, height: 100))
        XCTAssertGreaterThan(rect.height, 0)
        XCTAssertGreaterThanOrEqual(rect.minY, 0)
        XCTAssertLessThanOrEqual(rect.maxY, 100)
        XCTAssertThrowsError(try ImageLoader.thumbnail(prepared.data, maxDimension: 0))
    }

    func testRejectedInkIsRestoredInsteadOfLookingSuccessfullySaved() {
        let accepted = drawing(); let canvas = WritingCanvasView()
        canvas.drawing = accepted
        let session = WritingSession(); session.canvas = canvas
        let coordinator = WritingCanvas.Coordinator(session: session, onChange: { _ in false })
        coordinator.setBaseline(accepted)
        canvas.drawing = PKDrawing()
        coordinator.canvasViewDrawingDidChange(canvas)
        XCTAssertEqual(canvas.drawing.dataRepresentation(), accepted.dataRepresentation())
    }

    func testModelRefusalDoesNotClearInkOrAddUndo() {
        let canvas = WritingCanvasView(); canvas.localUndoManager.groupsByEvent = false
        canvas.localUndoManager.disableUndoRegistration(); canvas.drawing = drawing(); canvas.localUndoManager.enableUndoRegistration()
        canvas.localUndoManager.removeAllActions()
        let data = canvas.drawing.dataRepresentation()
        let session = WritingSession(); session.canvas = canvas; session.inkChanged = { _ in false }
        XCTAssertFalse(session.clearInk())
        XCTAssertEqual(canvas.drawing.dataRepresentation(), data)
        XCTAssertFalse(canvas.localUndoManager.canUndo)
    }

    func testImageReferencesCannotMasqueradeAsPDFOrEscapeAssets() {
        var note = Notebook(title: "Проверка")
        note.pages[0].images = [PageImage(asset: "payload.pdf")]
        XCTAssertThrowsError(try LibraryStore.validate(note))
        note.pages[0].images = [PageImage(asset: "../outside.png")]
        XCTAssertThrowsError(try LibraryStore.validate(note))
    }

    func testFailedPageInsertionDoesNotLeaveDuplicatesInMemory() throws {
        let root = try directory(); let store = LibraryStore(root: root)
        let id = try store.create(title: "Одна страница", paper: .blank, color: "teal", premium: false)
        let pageID = try XCTUnwrap(store.notebook(id)?.pages.first?.id)
        let primary = root.appendingPathComponent("library.json")
        try FileManager.default.removeItem(at: primary)
        try FileManager.default.createDirectory(at: primary, withIntermediateDirectories: false)
        XCTAssertThrowsError(try store.insertPage(in: id, after: pageID, configuration: PaperConfiguration()))
        XCTAssertThrowsError(try store.insertPage(in: id, after: pageID, configuration: PaperConfiguration()))
        XCTAssertEqual(store.notebook(id)?.pages.count, 1)
    }

    func testImportedPDFAnnotationIsIncludedInPageAppearance() throws {
        let bytes = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 300, height: 400)).pdfData { $0.beginPage() }
        let document = try XCTUnwrap(PDFDocument(data: bytes))
        let pdfPage = try XCTUnwrap(document.page(at: 0))
        let annotation = PDFAnnotation(bounds: CGRect(x: 100, y: 100, width: 100, height: 100), forType: .square, withProperties: nil)
        annotation.color = .red; annotation.interiorColor = .red
        pdfPage.addAnnotation(annotation)
        let store = LibraryStore(root: try directory())
        let asset = try store.storeAsset(XCTUnwrap(document.dataRepresentation()), extension: "pdf")
        let page = NotePage(paper: .blank, width: 595, height: 595 * 4 / 3, pdfAsset: asset, pdfPage: 0)
        let image = try PageRenderer.background(page, store: store)
        let crop = try XCTUnwrap(image.cgImage?.cropping(to: CGRect(x: 297.5 * image.scale, y: 496 * image.scale, width: 1, height: 1)))
        var pixel = [UInt8](repeating: 0, count: 4)
        try pixel.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(crop, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        XCTAssertGreaterThan(pixel[0], 200)
        XCTAssertLessThan(pixel[1], 80)
    }

    func testRotatedPDFImportMatchesDisplayedAspectRatio() async throws {
        let root = try directory(); let store = LibraryStore(root: root)
        for angle in [90, 270] {
            let bytes = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 300, height: 400)).pdfData { $0.beginPage() }
            let document = try XCTUnwrap(PDFDocument(data: bytes))
            let sourcePage = try XCTUnwrap(document.page(at: 0)); sourcePage.rotation = angle
            let file = root.appendingPathComponent("rotated-\(angle).pdf")
            try XCTUnwrap(document.dataRepresentation()).write(to: file)
            await store.importDocument(file, premium: false)
            XCTAssertNil(store.error)
            let page = try XCTUnwrap(store.library.notebooks.first?.pages.first)
            XCTAssertEqual(page.width / page.height, 4.0 / 3, accuracy: 0.001)
        }
    }
}
