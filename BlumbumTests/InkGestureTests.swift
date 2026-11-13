import XCTest
import PencilKit
import UIKit
@testable import Blumbum

private func zigzag() -> [CGPoint] {
    let anchors: [CGPoint] = [CGPoint(x: 60, y: 90), CGPoint(x: 180, y: 110),
                             CGPoint(x: 60, y: 100), CGPoint(x: 180, y: 90), CGPoint(x: 60, y: 110)]
    return (0..<(anchors.count - 1)).flatMap { segment in
        (0..<12).map { step in
            let t = CGFloat(step) / 11
            return CGPoint(x: anchors[segment].x + (anchors[segment + 1].x - anchors[segment].x) * t,
                           y: anchors[segment].y + (anchors[segment + 1].y - anchors[segment].y) * t)
        }
    }
}

private func stroke(_ points: [CGPoint], ink: PKInk.InkType = .pen, transform: CGAffineTransform = .identity) -> PKStroke {
    let controls = points.enumerated().map { index, point in
        PKStrokePoint(location: point, timeOffset: Double(index) / Double(max(1, points.count - 1)),
                      size: CGSize(width: 2, height: 2), opacity: 1, force: 0.5, azimuth: 0, altitude: .pi / 2)
    }
    return PKStroke(ink: PKInk(ink, color: .black), path: PKStrokePath(controlPoints: controls, creationDate: Date()), transform: transform, mask: nil)
}

final class InkGestureGeometryTests: XCTestCase {
    func testFastRepeatedWideSweepsAreRecognized() {
        let region = InkGestureGeometry.scribbleRegion(points: zigzag(), duration: 1)
        XCTAssertNotNil(region)
        XCTAssertTrue(region?.contains(CGPoint(x: 120, y: 100)) == true)
    }

    func testUnderlineAndLeftToRightWritingAreNotEraseGestures() {
        let underline = (0..<40).map { CGPoint(x: Double($0) * 4, y: 100) }
        let waves = (0..<80).map { CGPoint(x: Double($0) * 2, y: 100 + sin(Double($0)) * 10) }
        XCTAssertNil(InkGestureGeometry.scribbleRegion(points: underline, duration: 0.5))
        XCTAssertNil(InkGestureGeometry.scribbleRegion(points: waves, duration: 1))
    }

    func testLoopSlowDrawingAndNonFiniteInputAreRejected() {
        let circle = (0...80).map { CGPoint(x: 100 + cos(Double($0) * .pi / 40) * 40, y: 100 + sin(Double($0) * .pi / 40) * 40) }
        XCTAssertNil(InkGestureGeometry.scribbleRegion(points: circle, duration: 1))
        XCTAssertNil(InkGestureGeometry.scribbleRegion(points: zigzag(), duration: 5))
        XCTAssertNil(InkGestureGeometry.scribbleRegion(points: zigzag(), duration: .nan))
        XCTAssertNil(InkGestureGeometry.scribbleRegion(points: [CGPoint(x: Double.infinity, y: 1)], duration: 1))
    }

    func testOnlyMostlyCoveredStrokesAreCandidates() {
        let region = CGRect(x: 60, y: 80, width: 120, height: 40)
        XCTAssertTrue(InkGestureGeometry.substantiallyCovered([CGPoint(x: 100, y: 100)], by: region))
        let crossing = (0...100).map { CGPoint(x: Double($0) * 6 - 200, y: 100) }
        XCTAssertFalse(InkGestureGeometry.substantiallyCovered(crossing, by: region))
    }

    func testLineSnappingDoesNotChangeShortDashesOrCurves() {
        XCTAssertNil(InkGestureGeometry.straightLine([.zero, CGPoint(x: 10, y: 1)]))
        XCTAssertNil(InkGestureGeometry.straightLine([.zero, CGPoint(x: 50, y: 50), CGPoint(x: 100, y: 0)]))
        let line = InkGestureGeometry.straightLine([CGPoint(x: 0, y: 10), CGPoint(x: 50, y: 10.4), CGPoint(x: 100, y: 11)])
        XCTAssertNotNil(line)
        XCTAssertEqual(line?.end.y ?? 0, 10, accuracy: 0.001)
    }
}

@MainActor
final class InkGestureProcessorTests: XCTestCase {
    func testPaintingBrushesNeitherTriggerEraseNorBecomeEraseTargets() {
        let word = stroke([CGPoint(x: 90, y: 95), CGPoint(x: 110, y: 105)])
        for brush in [PKInk.InkType.watercolor, .crayon] {
            XCTAssertNil(InkGestureProcessor.edit(previous: PKDrawing(strokes: [word]),
                completed: PKDrawing(strokes: [word, stroke(zigzag(), ink: brush)]), scribbleErase: true, straightenLines: true))
            let artwork = stroke([CGPoint(x: 90, y: 95), CGPoint(x: 110, y: 105)], ink: brush)
            XCTAssertNil(InkGestureProcessor.edit(previous: PKDrawing(strokes: [artwork]),
                completed: PKDrawing(strokes: [artwork, stroke(zigzag())]), scribbleErase: true, straightenLines: false))
        }
    }

    func testScribbleRemovesInkButKeepsLongDiagramAndMarker() throws {
        let word = stroke([CGPoint(x: 90, y: 95), CGPoint(x: 100, y: 105), CGPoint(x: 110, y: 95)])
        let diagram = stroke([CGPoint(x: -200, y: 100), CGPoint(x: 400, y: 100)])
        let marker = stroke([CGPoint(x: 80, y: 100), CGPoint(x: 150, y: 100)], ink: .marker)
        let previous = PKDrawing(strokes: [word, diagram, marker])
        let edit = try XCTUnwrap(InkGestureProcessor.edit(previous: previous,
            completed: PKDrawing(strokes: previous.strokes + [stroke(zigzag())]), scribbleErase: true, straightenLines: false))
        XCTAssertEqual(edit.erasedCount, 1)
        XCTAssertEqual(edit.drawing.strokes.count, 2)
        XCTAssertTrue(edit.drawing.strokes.contains { $0.ink.inkType == .marker })
    }

    func testEmptyAreaDisabledSettingAndMarkerGestureKeepInk() {
        let previous = PKDrawing()
        let completed = PKDrawing(strokes: [stroke(zigzag())])
        XCTAssertNil(InkGestureProcessor.edit(previous: previous, completed: completed, scribbleErase: true, straightenLines: false))
        let word = PKDrawing(strokes: [stroke([CGPoint(x: 90, y: 95), CGPoint(x: 110, y: 105)])])
        XCTAssertNil(InkGestureProcessor.edit(previous: word, completed: PKDrawing(strokes: word.strokes + completed.strokes), scribbleErase: false, straightenLines: false))
        XCTAssertNil(InkGestureProcessor.edit(previous: word, completed: PKDrawing(strokes: word.strokes + [stroke(zigzag(), ink: .marker)]), scribbleErase: true, straightenLines: false))
    }

    func testMovedInkUsesItsPageCoordinates() throws {
        let moved = stroke([CGPoint(x: 0, y: 0), CGPoint(x: 15, y: 8)], transform: CGAffineTransform(translationX: 90, y: 95))
        let previous = PKDrawing(strokes: [moved])
        let edit = try XCTUnwrap(InkGestureProcessor.edit(previous: previous, completed: PKDrawing(strokes: [moved, stroke(zigzag())]), scribbleErase: true, straightenLines: false))
        XCTAssertEqual(edit.erasedCount, 1)
    }

    func testLineAssistRequiresSettingAndPreservesInk() throws {
        let line = stroke([CGPoint(x: 0, y: 10), CGPoint(x: 50, y: 10.2), CGPoint(x: 100, y: 11)])
        let completed = PKDrawing(strokes: [line])
        XCTAssertNil(InkGestureProcessor.edit(previous: PKDrawing(), completed: completed, scribbleErase: false, straightenLines: false))
        let edit = try XCTUnwrap(InkGestureProcessor.edit(previous: PKDrawing(), completed: completed, scribbleErase: false, straightenLines: true))
        XCTAssertEqual(edit.drawing.strokes.count, 1)
        XCTAssertEqual(edit.drawing.strokes[0].ink.inkType, line.ink.inkType)
        XCTAssertEqual(edit.drawing.strokes[0].path[8].location.y, 10, accuracy: 0.1)
    }
}

@MainActor
private final class UndoTestCanvas: WritingCanvasView {
    var history: UndoManager { localUndoManager }

    func recordNativeDrawing(_ value: PKDrawing) {
        let previous = drawing
        history.disableUndoRegistration(); drawing = value; history.enableUndoRegistration()
        let needsGroup = history.groupingLevel == 0 && !history.isUndoing && !history.isRedoing
        if needsGroup { history.beginUndoGrouping() }
        history.registerUndo(withTarget: self) { target in target.recordNativeDrawing(previous) }
        if needsGroup { history.endUndoGrouping() }
    }
}

@MainActor
final class InkGestureUndoTests: XCTestCase {
    func testUnexpectedNativeUndoGroupingLeavesCompletedDrawingIntact() throws {
        let canvas = UndoTestCanvas(); canvas.history.groupsByEvent = false
        let before = PKDrawing(strokes: [stroke([CGPoint(x: 90, y: 95), CGPoint(x: 110, y: 105)])])
        let completed = PKDrawing(strokes: before.strokes + [stroke(zigzag())])
        // Simulate UIKit grouping an older change with this stroke: undo reaches empty, not before.
        canvas.recordNativeDrawing(completed)
        let session = WritingSession(); session.canvas = canvas; session.inkChanged = { _ in true }
        let edit = try XCTUnwrap(InkGestureProcessor.edit(previous: before, completed: completed, scribbleErase: true, straightenLines: false))
        XCTAssertFalse(session.applyGesture(edit, previous: before, completed: completed))
        XCTAssertEqual(canvas.drawing.dataRepresentation(), completed.dataRepresentation())
    }

    func testEraseHasOneUndoStepAndRedoNeverBringsBackScribble() throws {
        let canvas = UndoTestCanvas()
        canvas.history.groupsByEvent = false
        let session = WritingSession(); session.canvas = canvas; session.inkChanged = { _ in true }
        let before = PKDrawing(strokes: [stroke([CGPoint(x: 90, y: 95), CGPoint(x: 110, y: 105)])])
        canvas.recordNativeDrawing(before)
        let completed = PKDrawing(strokes: before.strokes + [stroke(zigzag())])
        canvas.recordNativeDrawing(completed)
        let edit = try XCTUnwrap(InkGestureProcessor.edit(previous: before, completed: completed, scribbleErase: true, straightenLines: false))
        XCTAssertTrue(session.applyGesture(edit, previous: before, completed: completed))
        XCTAssertTrue(canvas.drawing.strokes.isEmpty)
        session.undo()
        XCTAssertEqual(canvas.drawing.dataRepresentation(), before.dataRepresentation())
        session.redo()
        XCTAssertTrue(canvas.drawing.strokes.isEmpty)
        session.undo(); session.undo()
        XCTAssertTrue(canvas.drawing.strokes.isEmpty, "Next undo reaches the action before the gesture, without a hidden scribble action")
    }

    func testClearCanBeUndoneAndReadOnlyBlocksChanges() {
        let canvas = UndoTestCanvas(); canvas.history.groupsByEvent = false
        let original = PKDrawing(strokes: [stroke([.zero, CGPoint(x: 100, y: 100)])])
        canvas.recordNativeDrawing(original)
        let session = WritingSession(); session.canvas = canvas; session.inkChanged = { _ in true }
        session.readOnly = true
        XCTAssertFalse(session.clearInk())
        session.undo()
        XCTAssertEqual(canvas.drawing.dataRepresentation(), original.dataRepresentation())
        session.readOnly = false
        XCTAssertTrue(session.clearInk())
        session.undo()
        XCTAssertEqual(canvas.drawing.dataRepresentation(), original.dataRepresentation())
    }
}
