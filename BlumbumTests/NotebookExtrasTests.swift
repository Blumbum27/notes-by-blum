import XCTest
import PencilKit
import UIKit
@testable import Blumbum

@MainActor
final class NotebookExtrasTests: XCTestCase {
    private func root() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return root
    }

    private func sampleDrawing() -> PKDrawing {
        let points = [CGPoint(x: 900, y: 800), CGPoint(x: 1000, y: 850), CGPoint(x: 1100, y: 800)]
        let path = PKStrokePath(controlPoints: points.enumerated().map { index, location in
            PKStrokePoint(location: location, timeOffset: Double(index) * 0.1, size: CGSize(width: 3, height: 3), opacity: 1, force: 0.5, azimuth: 0, altitude: .pi / 2)
        }, creationDate: Date())
        return PKDrawing(strokes: [PKStroke(ink: PKInk(.pen, color: .black), path: path, transform: .identity, mask: nil)])
    }

    func testLegacyJSONWithoutNewOptionalFieldsStillOpens() throws {
        var value = Library(notebooks: [Notebook(title: "Старая тетрадь")])
        value.notebooks[0].pages[0].texts = [TextBlock(text: "Старый текст")]
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
        json.removeValue(forKey: "inkElements")
        var notes = try XCTUnwrap(json["notebooks"] as? [[String: Any]])
        var pages = try XCTUnwrap(notes[0]["pages"] as? [[String: Any]])
        pages[0].removeValue(forKey: "paperTint")
        var texts = try XCTUnwrap(pages[0]["texts"] as? [[String: Any]])
        texts[0].removeValue(forKey: "background")
        pages[0]["texts"] = texts; notes[0]["pages"] = pages; json["notebooks"] = notes
        let decoded = try JSONDecoder().decode(Library.self, from: JSONSerialization.data(withJSONObject: json))
        try LibraryStore.validate(decoded)
        XCTAssertNil(decoded.inkElements)
        XCTAssertNil(decoded.notebooks[0].pages[0].paperTint)
        XCTAssertNil(decoded.notebooks[0].pages[0].texts[0].background)
    }

    func testPaperAndStickyColorSurviveEditableArchive() async throws {
        let store = LibraryStore(root: try root())
        let id = try store.create(title: "Цвета", paper: .dots, color: "teal", tint: .blue, premium: false)
        let pageID = try XCTUnwrap(store.notebook(id)?.pages.first?.id)
        store.updatePage(id, pageID) { $0.texts = [TextBlock(text: "Стикер", background: .pink)] }
        let archive = try store.exportArchive(XCTUnwrap(store.notebook(id)))
        addTeardownBlock { try? FileManager.default.removeItem(at: archive) }
        let restored = LibraryStore(root: try root())
        await restored.importDocument(archive, premium: false)
        XCTAssertNil(restored.error)
        XCTAssertEqual(restored.library.notebooks[0].pages[0].paperTint, .blue)
        XCTAssertEqual(restored.library.notebooks[0].pages[0].texts[0].background, .pink)
    }

    func testSavedElementSurvivesReloadAndDeletionDoesNotChangePlacedInk() throws {
        let directory = try root()
        let store = LibraryStore(root: directory)
        let data = sampleDrawing().dataRepresentation()
        try store.saveInkElement(title: "Подпись", drawing: data)
        let element = try XCTUnwrap(store.library.inkElements?.first)
        let id = try store.create(title: "Копия подписи", paper: .blank, color: "blue", premium: false)
        let pageID = try XCTUnwrap(store.notebook(id)?.pages.first?.id)
        let placed = try InkElementPlacement.placed(data, on: CGSize(width: 595, height: 842)).dataRepresentation()
        store.updatePage(id, pageID) { $0.drawing = placed }; store.flush()
        let reloaded = LibraryStore(root: directory)
        XCTAssertEqual(reloaded.library.inkElements?.first?.title, "Подпись")
        try reloaded.deleteInkElement(element.id)
        XCTAssertTrue(reloaded.library.inkElements?.isEmpty == true)
        XCTAssertEqual(reloaded.notebook(id)?.pages[0].drawing, placed)
    }

    func testElementPlacementFitsAndCentersWithoutChangingOriginal() throws {
        let drawing = sampleDrawing()
        let data = drawing.dataRepresentation()
        let size = CGSize(width: 200, height: 300)
        let placed = try InkElementPlacement.placed(data, on: size)
        XCTAssertEqual(placed.bounds.midX, 100, accuracy: 1)
        XCTAssertEqual(placed.bounds.midY, 150, accuracy: 1)
        XCTAssertLessThanOrEqual(placed.bounds.width, 151)
        XCTAssertLessThanOrEqual(placed.bounds.height, 106)
        XCTAssertEqual(drawing.dataRepresentation(), data)
    }

    func testInvalidAndEmptyElementsAreRejected() {
        XCTAssertThrowsError(try InkElementPlacement.validate(Data("bad drawing".utf8)))
        XCTAssertThrowsError(try InkElementPlacement.validate(PKDrawing().dataRepresentation()))
        XCTAssertThrowsError(try InkElementPlacement.validate(Data(repeating: 0, count: 1_000_001)))
    }

    func testInsertingElementCanBeUndoneAndReadOnlyRejectsInsertion() throws {
        let canvas = WritingCanvasView(); canvas.localUndoManager.groupsByEvent = false
        let session = WritingSession(); session.canvas = canvas; session.inkChanged = { _ in true }
        let data = sampleDrawing().dataRepresentation()
        XCTAssertTrue(try session.insertElement(data, pageSize: CGSize(width: 595, height: 842)))
        XCTAssertEqual(canvas.drawing.strokes.count, 1)
        session.undo(); XCTAssertTrue(canvas.drawing.strokes.isEmpty)
        session.redo(); XCTAssertEqual(canvas.drawing.strokes.count, 1)
        XCTAssertTrue(try session.insertElement(data, pageSize: CGSize(width: 595, height: 842)))
        XCTAssertEqual(canvas.drawing.strokes.count, 2, "Repeated insertion creates an independent copy")
        session.undo(); XCTAssertEqual(canvas.drawing.strokes.count, 1)
        session.readOnly = true
        XCTAssertFalse(try session.insertElement(data, pageSize: CGSize(width: 595, height: 842)))
        XCTAssertEqual(canvas.drawing.strokes.count, 1)
    }

    func testColoredPaperAndStickerRenderDifferentBackgrounds() throws {
        let store = LibraryStore(root: try root())
        var page = NotePage(paper: .blank, paperTint: .blue)
        page.texts = [TextBlock(text: "", x: 30, y: 30, background: .pink)]
        let image = try PageRenderer.background(page, store: store)
        let paper = try pixel(image, x: 10, y: 10)
        let sticker = try pixel(image, x: 70, y: 70)
        XCTAssertEqual(paper[0], PaperTint.blue.rgb.0, accuracy: 0.03)
        XCTAssertEqual(sticker[0], PaperTint.pink.rgb.0, accuracy: 0.03)
        XCTAssertNotEqual(paper, sticker)
    }

    func testThumbnailHasBoundedPixelSize() async throws {
        let store = LibraryStore(root: try root())
        let image = try await PageRenderer.thumbnail(NotePage(paper: .grid, paperTint: .ivory), store: store)
        let cg = try XCTUnwrap(image.cgImage)
        XCTAssertLessThanOrEqual(max(cg.width, cg.height), 241)
    }

    private func pixel(_ image: UIImage, x: Double, y: Double) throws -> [Double] {
        let cg = try XCTUnwrap(image.cgImage)
        let crop = try XCTUnwrap(cg.cropping(to: CGRect(x: x * image.scale, y: y * image.scale, width: 1, height: 1)))
        var bytes = [UInt8](repeating: 0, count: 4)
        try bytes.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(crop, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        return bytes.prefix(3).map { Double($0) / 255 }
    }
}
