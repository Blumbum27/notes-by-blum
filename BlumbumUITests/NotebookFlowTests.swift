import XCTest
import Foundation

final class NotebookFlowTests: XCTestCase {
    @MainActor
    func testNotebookAndAddedPageSurviveRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let create = app.buttons["library.create"]
        XCTAssertTrue(create.waitForExistence(timeout: 20))
        let ready = NSPredicate(format: "enabled == true")
        expectation(for: ready, evaluatedWith: create)
        waitForExpectations(timeout: 20)
        create.tap()
        let field = app.textFields["notebook.title"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        let title = "Smoke " + String(UUID().uuidString.prefix(6))
        field.tap(); field.typeText(title)
        app.buttons["notebook.create"].tap()
        let pages = app.buttons["pages.open"]
        XCTAssertTrue(pages.waitForExistence(timeout: 15))
        app.buttons["pages.add"].tap()
        app.buttons["Клетка"].tap()
        expectation(for: NSPredicate(format: "label CONTAINS %@", "2 / 2"), evaluatedWith: pages)
        waitForExpectations(timeout: 10)
        let readMode = app.buttons["writing.readOnly"]
        XCTAssertTrue(readMode.waitForExistence(timeout: 5))
        readMode.tap()
        XCTAssertEqual(readMode.label, "Включить редактирование")
        readMode.tap()
        XCTAssertEqual(readMode.label, "Режим чтения")
        let quickTools = app.scrollViews["writing.quickTools"]
        quickTools.swipeLeft()
        let laser = app.buttons["writing.laser"]
        XCTAssertTrue(laser.waitForExistence(timeout: 5))
        laser.tap()
        XCTAssertEqual(laser.label, "Выключить лазерную указку")
        let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.4, dy: 0.6))
        let to = app.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.65))
        from.press(forDuration: 0.05, thenDragTo: to)
        laser.tap()
        XCTAssertFalse(app.buttons["writing.undo"].isEnabled, "Laser gestures must not add ink undo operations")
        app.buttons["notebook.actions"].tap()
        app.buttons["Бумага и макет"].tap()
        XCTAssertTrue(app.buttons["paper.apply"].waitForExistence(timeout: 10))
        app.buttons["Голубой"].tap()
        let cornell = app.buttons["Конспект Cornell"]
        for _ in 0..<6 {
            if cornell.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(cornell.isHittable)
        cornell.tap()
        app.buttons["paper.apply"].tap()
        XCTAssertTrue(app.buttons["pages.open"].waitForExistence(timeout: 10))
        let editor = XCTAttachment(screenshot: app.screenshot())
        editor.name = "Blumbum notebook editor"
        editor.lifetime = .keepAlways
        add(editor)
        // Adding a page calls flush; terminate also verifies durable state rather than view state.
        app.terminate(); app.launch()
        let cover = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
        XCTAssertTrue(cover.waitForExistence(timeout: 15))
        cover.tap()
        XCTAssertTrue(app.buttons["pages.open"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["pages.open"].label.contains("2 / 2"), "Reopen on the last viewed page")
    }
}
