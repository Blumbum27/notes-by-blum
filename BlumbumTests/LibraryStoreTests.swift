import XCTest
import PencilKit
import UIKit
@testable import Blumbum

@MainActor
final class LibraryStoreTests: XCTestCase {
    private func temporaryRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return root
    }

    func testRoundTripKeepsPageIdentityTextAndInk() throws {
        let root = try temporaryRoot()
        let store = LibraryStore(root: root)
        let id = try store.create(title: "Лекция", paper: .grid, color: "clay", premium: false)
        let page = try XCTUnwrap(store.notebook(id)?.pages.first)
        let ink = PKDrawing().dataRepresentation()
        store.updatePage(id, page.id) { $0.drawing = ink; $0.texts = [TextBlock(text: "Важная мысль")] }
        store.flush()
        let reopened = LibraryStore(root: root)
        XCTAssertFalse(reopened.loadFailed)
        XCTAssertEqual(reopened.notebook(id)?.pages.first?.id, page.id)
        XCTAssertEqual(reopened.notebook(id)?.pages.first?.drawing, ink)
        XCTAssertEqual(reopened.notebook(id)?.pages.first?.texts.first?.text, "Важная мысль")
    }

    func testTrashDoesNotBypassFreeLimitAndPermanentDeletionFreesSlot() throws {
        let store = LibraryStore(root: try temporaryRoot())
        let first = try store.create(title: "1", paper: .blank, color: "teal", premium: false)
        _ = try store.create(title: "2", paper: .blank, color: "teal", premium: false)
        _ = try store.create(title: "3", paper: .blank, color: "teal", premium: false)
        store.update(first) { $0.deletedAt = Date() }
        XCTAssertThrowsError(try store.create(title: "4", paper: .blank, color: "teal", premium: false))
        try store.deletePermanently(first)
        XCTAssertNoThrow(try store.create(title: "4", paper: .blank, color: "teal", premium: false))
    }

    func testCorruptLibraryIsNeverOverwritten() throws {
        let root = try temporaryRoot()
        let url = root.appendingPathComponent("library.json")
        let corrupt = Data("not json".utf8)
        try corrupt.write(to: url)
        let store = LibraryStore(root: root)
        XCTAssertTrue(store.loadFailed)
        store.flush()
        XCTAssertThrowsError(try store.create(title: "Новая", paper: .blank, color: "teal", premium: true))
        XCTAssertEqual(try Data(contentsOf: url), corrupt)
    }

    func testAssetPathsCannotEscapeAssetDirectory() throws {
        let store = LibraryStore(root: try temporaryRoot())
        for path in ["../library.json", "..\\secret", "/tmp/foo", "", "a/b"] {
            XCTAssertThrowsError(try store.assetURL(path))
        }
        XCTAssertNoThrow(try store.assetURL("safe.pdf"))
    }

    func testArchiveRoundTripRemapsIdentityAndAssets() async throws {
        let source = LibraryStore(root: try temporaryRoot())
        let id = try source.create(title: "Копия", paper: .dots, color: "blue", premium: false)
        let page = try XCTUnwrap(source.notebook(id)?.pages.first)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10)).image { context in
            UIColor.red.setFill(); context.fill(CGRect(x: 0, y: 0, width: 10, height: 10))
        }
        let data = try XCTUnwrap(image.pngData())
        let asset = try source.storeAsset(data, extension: "png")
        source.updatePage(id, page.id) {
            $0.texts = [TextBlock(text: "Сохрани меня")]
            $0.images = [PageImage(asset: asset)]
        }
        let note = try XCTUnwrap(source.notebook(id))
        let archive = try source.exportArchive(note)
        defer { try? FileManager.default.removeItem(at: archive) }
        let target = LibraryStore(root: try temporaryRoot())
        await target.importDocument(archive, premium: false)
        XCTAssertNil(target.error)
        let restored = try XCTUnwrap(target.library.notebooks.first)
        XCTAssertNotEqual(restored.id, note.id)
        XCTAssertNotEqual(restored.pages.first?.id, page.id)
        XCTAssertEqual(restored.pages.first?.texts.first?.text, "Сохрани меня")
        let restoredAsset = try XCTUnwrap(restored.pages.first?.images.first?.asset)
        XCTAssertNotEqual(restoredAsset, asset)
        XCTAssertEqual(try target.readAsset(restoredAsset), data)
    }

    func testUnknownSchemaAndEmptyPageListsAreRejected() throws {
        var future = Library(); future.version = 2
        XCTAssertThrowsError(try LibraryStore.validate(future))
        let empty = Notebook(title: "Пустая", pages: [])
        XCTAssertThrowsError(try LibraryStore.validate(empty))
        var invalid = Notebook(title: "Размер")
        invalid.pages[0].width = .infinity
        XCTAssertThrowsError(try LibraryStore.validate(invalid))
    }
}
