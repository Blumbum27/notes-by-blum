import PencilKit
import UIKit

struct InkGestureEdit {
    let drawing: PKDrawing
    let title: String
    let erasedCount: Int
}

enum InkGestureProcessor {
    static func supportsGestures(_ ink: PKInk.InkType) -> Bool {
        ink == .pen || ink == .pencil || ink == .monoline || ink == .fountainPen
    }
    static func edit(previous: PKDrawing, completed: PKDrawing, scribbleErase: Bool, straightenLines: Bool) -> InkGestureEdit? {
        guard completed.strokes.count == previous.strokes.count + 1,
              let stroke = completed.strokes.last, stroke.path.count > 1,
              supportsGestures(stroke.ink.inkType) else { return nil }
        let points = samples(stroke)
        let duration = stroke.path[stroke.path.count - 1].timeOffset - stroke.path[0].timeOffset
        if scribbleErase, let region = InkGestureGeometry.scribbleRegion(points: points, duration: duration) {
            let removed = previous.strokes.indices.filter { index in
                let target = previous.strokes[index]
                // Highlighting is deliberate markup, not accidental handwriting.
                guard supportsGestures(target.ink.inkType), target.mask == nil, target.renderBounds.intersects(region) else { return false }
                return InkGestureGeometry.substantiallyCovered(samples(target), by: region)
            }
            if !removed.isEmpty {
                let indices = Set(removed)
                let kept = previous.strokes.enumerated().filter { !indices.contains($0.offset) }.map(\.element)
                return InkGestureEdit(drawing: PKDrawing(strokes: kept), title: "Стирание зачеркиванием", erasedCount: removed.count)
            }
            // A scribble over empty paper is an ordinary stroke and remains visible.
            return nil
        }
        if straightenLines, stroke.transform.isIdentity, stroke.mask == nil,
           let line = InkGestureGeometry.straightLine(points) {
            let template = stroke.path[stroke.path.count / 2]
            let controls = (0...16).map { index -> PKStrokePoint in
                let t = CGFloat(index) / 16
                return PKStrokePoint(
                    location: CGPoint(x: line.start.x + (line.end.x - line.start.x) * t,
                                      y: line.start.y + (line.end.y - line.start.y) * t),
                    timeOffset: max(0.01, duration) * Double(t), size: template.size,
                    opacity: template.opacity, force: template.force,
                    azimuth: template.azimuth, altitude: template.altitude
                )
            }
            let path = PKStrokePath(controlPoints: controls, creationDate: stroke.path.creationDate)
            let lineStroke = PKStroke(ink: stroke.ink, path: path, transform: .identity, mask: nil)
            return InkGestureEdit(drawing: PKDrawing(strokes: previous.strokes + [lineStroke]), title: "Выпрямление линии", erasedCount: 0)
        }
        return nil
    }

    private static func samples(_ stroke: PKStroke) -> [CGPoint] {
        guard !stroke.path.isEmpty else { return [] }
        // Sample in curve parameter space with a strict bound on work per stroke.
        let count = min(512, max(16, stroke.path.count * 3))
        let end = CGFloat(stroke.path.count - 1)
        return (0..<count).map { index in
            stroke.path.interpolatedPoint(at: end * CGFloat(index) / CGFloat(count - 1)).location.applying(stroke.transform)
        }
    }
}
