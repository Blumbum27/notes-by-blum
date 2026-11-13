import XCTest
import PencilKit
import UIKit
@testable import Blumbum

@MainActor
final class PaperTemplateTests: XCTestCase {
    private func makeStore() throws -> LibraryStore {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return LibraryStore(root: root)
    }

    func testBundledCatalogIsValidAndComplete() throws {
        let catalog = try PaperCatalog.result.get()
        XCTAssertEqual(catalog.templates.count, 8)
        XCTAssertEqual(Set(catalog.templates.map(\.id)).count, 8)
    }

    func testEveryLayoutCanRenderInEveryColorAndOrientation() {
        for layout in PaperCatalog.layouts {
            for tint in PaperTint.allCases {
                for landscape in [false, true] {
                    autoreleasepool {
                        var configuration = PaperConfiguration(style: .blank, tint: tint)
                        configuration.templateID = layout.id; configuration.landscape = landscape
                        let image = PaperTemplateRenderer.preview(configuration, maxDimension: 80)
                        XCTAssertNotNil(image.cgImage)
                        XCTAssertLessThanOrEqual(max(image.cgImage?.width ?? 0, image.cgImage?.height ?? 0), 161)
                    }
                }
            }
        }
    }

    func testAppearanceArchiveRoundTripPreservesAllSettings() async throws {
        let source = try makeStore()
        var configuration = PaperConfiguration(style: .ruled, tint: .mint)
        configuration.templateID = "cornell"; configuration.spacing = 32; configuration.margin = 48
        configuration.format = .a5; configuration.landscape = true
        let id = try source.create(title: "Конспект", color: "teal", configuration: configuration, premium: false)
        let original = try XCTUnwrap(source.notebook(id))
        let file = try source.exportArchive(original)
        addTeardownBlock { try? FileManager.default.removeItem(at: file) }
        let target = try makeStore(); await target.importDocument(file, premium: false)
        XCTAssertNil(target.error)
        let page = try XCTUnwrap(target.library.notebooks.first?.pages.first)
        XCTAssertEqual(page.paperTemplateID, "cornell")
        XCTAssertEqual(page.paperTint, .mint); XCTAssertEqual(page.paperSpacing, 32); XCTAssertEqual(page.paperMargin, 48)
        XCTAssertEqual(page.width, 595); XCTAssertEqual(page.height, 420)
    }

    func testFilledPageCannotBeResizedButCanChangeItsBackground() throws {
        let store = try makeStore()
        let id = try store.create(title: "Не обрезать", paper: .ruled, color: "teal", premium: false)
        let pageID = try XCTUnwrap(store.notebook(id)?.pages.first?.id)
        store.updatePage(id, pageID) { $0.texts = [TextBlock(text: "Сохранить координаты", x: 120, y: 400)] }; store.flush()
        var config = PaperConfiguration(style: .grid, tint: .blue); config.templateID = "weekly"; config.format = .a5
        XCTAssertThrowsError(try store.configurePaper(in: id, pageID: pageID, configuration: config, resize: true))
        try store.configurePaper(in: id, pageID: pageID, configuration: config, resize: false)
        let page = try XCTUnwrap(store.notebook(id)?.pages.first)
        XCTAssertEqual(page.id, pageID); XCTAssertEqual(page.width, 595); XCTAssertEqual(page.height, 842)
        XCTAssertEqual(page.texts.first?.y, 400); XCTAssertEqual(page.paperTemplateID, "weekly")
    }

    func testLegacyFollowingPageKeepsOriginalRuleCoordinates() {
        let old = NotePage(paper: .grid)
        let next = PaperConfiguration(page: old).makePage()
        XCTAssertNil(next.paperSpacing); XCTAssertNil(next.paperMargin); XCTAssertNil(next.paperTemplateID)
    }

    func testInvalidDensityIsRejectedAndNonFiniteDraftIsSanitized() throws {
        var note = Notebook(title: "Поля")
        note.pages[0].paperSpacing = 0
        XCTAssertThrowsError(try LibraryStore.validate(note))
        var config = PaperConfiguration(); config.spacing = .infinity; config.margin = .nan
        let page = config.makePage()
        XCTAssertEqual(page.paperSpacing, 24); XCTAssertEqual(page.paperMargin, 30)
    }
}
