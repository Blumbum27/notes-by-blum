import XCTest
import UIKit
import PDFKit
@testable import Blumbum

@MainActor
final class SafetyTests: XCTestCase {
    private func root() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func testPreviousSnapshotRecoversAndPreservesDamagedFile() throws {
        let directory = try root()
        let store = LibraryStore(root: directory)
        let id = try store.create(title: "До изменения", paper: .ruled, color: "teal", premium: false)
        store.update(id) { $0.title = "После изменения" }
        store.flush()
        let damagedData = Data("damaged".utf8)
        try damagedData.write(to: directory.appendingPathComponent("library.json"))
        let recovered = LibraryStore(root: directory)
        XCTAssertFalse(recovered.loadFailed)
        XCTAssertNotNil(recovered.recoveryNotice)
        XCTAssertEqual(recovered.notebook(id)?.title, "До изменения")
        let damaged = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .first { $0.lastPathComponent.hasPrefix("library.damaged-") }
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(damaged)), damagedData)
    }

    func testFutureSchemaNeverFallsBackToOlderBackup() throws {
        let directory = try root()
        let store = LibraryStore(root: directory)
        let id = try store.create(title: "Старая", paper: .blank, color: "teal", premium: false)
        store.update(id) { $0.title = "Сохранение" }; store.flush()
        var newer = Library(); newer.version = 9
        let data = try JSONEncoder().encode(newer)
        let url = directory.appendingPathComponent("library.json")
        try data.write(to: url)
        let reopened = LibraryStore(root: directory)
        XCTAssertTrue(reopened.loadFailed)
        reopened.flush()
        XCTAssertEqual(try Data(contentsOf: url), data)
    }

    func testCleanupKeepsPreviousReferencesAndRemovesOrphans() throws {
        let directory = try root()
        let store = LibraryStore(root: directory)
        let id = try store.create(title: "С вложением", paper: .blank, color: "teal", premium: false)
        let pageID = try XCTUnwrap(store.notebook(id)?.pages.first?.id)
        let data = Data("unreferenced test asset".utf8)
        let referenced = try store.storeAsset(data, extension: "png")
        store.updatePage(id, pageID) { $0.images.append(PageImage(asset: referenced)) }; store.flush()
        store.updatePage(id, pageID) { $0.images = [] }; store.flush()
        let orphan = try store.storeAsset(data, extension: "png")
        try store.collectUnusedAssets()
        XCTAssertTrue(FileManager.default.fileExists(atPath: try store.assetURL(referenced).path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: try store.assetURL(orphan).path))
        store.update(id) { $0.title = "Следующее сохранение" }; store.flush()
        try store.collectUnusedAssets()
        XCTAssertFalse(FileManager.default.fileExists(atPath: try store.assetURL(referenced).path))
    }

    func testInvalidImagesAreRejectedAndThumbnailsAreBounded() throws {
        XCTAssertThrowsError(try ImageLoader.thumbnail(Data("not an image".utf8)))
        let source = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 80)).image { context in
            UIColor.red.setFill(); context.fill(CGRect(x: 0, y: 0, width: 100, height: 80))
        }
        let data = try XCTUnwrap(source.pngData())
        let image = try ImageLoader.thumbnail(data, maxDimension: 40)
        XCTAssertLessThanOrEqual(image.size.width, 40)
        XCTAssertLessThanOrEqual(image.size.height, 40)
    }

    func testMalformedPageBoundsAndDuplicateObjectIDsAreRejected() throws {
        var note = Notebook(title: "Неверная страница")
        note.pages[0].width = 5000; note.pages[0].height = 5000
        XCTAssertThrowsError(try LibraryStore.validate(note))
        note.pages = [NotePage()]
        let text = TextBlock(text: "Один")
        note.pages[0].texts = [text, text]
        XCTAssertThrowsError(try LibraryStore.validate(note))
    }

    func testPDFImportAndExportKeepPageCountAndAspectRatio() async throws {
        let directory = try root()
        let input = directory.appendingPathComponent("example.pdf")
        let rectangle = CGRect(x: 0, y: 0, width: 300, height: 400)
        try UIGraphicsPDFRenderer(bounds: rectangle).writePDF(to: input) { context in
            context.beginPage()
            ("Page one" as NSString).draw(at: CGPoint(x: 20, y: 30), withAttributes: [.font: UIFont.systemFont(ofSize: 20)])
            context.beginPage(withBounds: CGRect(x: 0, y: 0, width: 400, height: 300), pageInfo: [:])
        }
        let store = LibraryStore(root: directory.appendingPathComponent("store"))
        await store.importDocument(input, premium: false)
        XCTAssertNil(store.error)
        let note = try XCTUnwrap(store.library.notebooks.first)
        XCTAssertEqual(note.pages.count, 2)
        XCTAssertEqual(note.pages[0].width / note.pages[0].height, 0.75, accuracy: 0.001)
        let output = try await PageRenderer.exportPDF(note, store: store)
        addTeardownBlock { try? FileManager.default.removeItem(at: output) }
        let pdf = try XCTUnwrap(PDFDocument(url: output))
        XCTAssertEqual(pdf.pageCount, 2)
        let first = try XCTUnwrap(pdf.page(at: 0)).bounds(for: .mediaBox)
        XCTAssertEqual(first.width / first.height, 0.75, accuracy: 0.001)
    }

    func testReleaseMetadataRejectsMissingAndNonPublicURLs() {
        XCTAssertFalse(AppConfiguration().isConfigured)
        XCTAssertNil(AppConfiguration.publicURL("http://example.com/privacy"))
        XCTAssertNil(AppConfiguration.publicURL("https://demo.invalid/privacy"))
        XCTAssertNil(AppConfiguration.publicURL("https://user:pass@company.com/privacy"))
    }
}
