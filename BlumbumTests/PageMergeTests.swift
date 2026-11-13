import XCTest
@testable import Blumbum

final class PageMergeTests: XCTestCase {
    func testConcurrentOfflinePagesSurviveInBothDirectionsAndOnRetry() throws {
        let base = NotePage()
        var phone = base, pad = base
        phone.texts = [TextBlock(text: "Телефон")]
        pad.texts = [TextBlock(text: "Планшет")]
        let merged = try PageMerge.merge(base: [base], local: [phone], remote: [pad])
        XCTAssertEqual(Set(merged.flatMap { $0.texts.map(\.text) }), ["Телефон", "Планшет"])
        XCTAssertEqual(Set(merged.map(\.id)).count, 2)
        XCTAssertEqual(merged, try PageMerge.merge(base: [base], local: [pad], remote: [phone]))
        XCTAssertEqual(Set(merged.map(\.id)), Set(try PageMerge.merge(base: [base], local: [pad], remote: merged).map(\.id)))
    }

    func testDeletesAndIndependentEdits() throws {
        let a = NotePage(), b = NotePage()
        var edited = b
        edited.bookmarked = true
        XCTAssertEqual(try PageMerge.merge(base: [a,b], local: [b], remote: [a,edited]), [edited])
        XCTAssertEqual(try PageMerge.merge(base: [a,b], local: [a], remote: [a,edited]), [a,edited])
    }
}
