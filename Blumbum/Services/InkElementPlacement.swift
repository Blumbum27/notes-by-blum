import Foundation
import PencilKit

enum InkElementPlacement {
    static func validate(_ data: Data) throws -> PKDrawing {
        guard !data.isEmpty, data.count <= 1_000_000 else { throw NoteError.invalidFile }
        let drawing = try PKDrawing(data: data)
        let bounds = drawing.bounds
        guard !drawing.strokes.isEmpty, !bounds.isNull, !bounds.isEmpty,
              bounds.minX.isFinite, bounds.minY.isFinite, bounds.width.isFinite, bounds.height.isFinite,
              abs(bounds.minX) <= 100000, abs(bounds.minY) <= 100000,
              bounds.width <= 10000, bounds.height <= 10000 else { throw NoteError.invalidFile }
        return drawing
    }

    static func placed(_ data: Data, on size: CGSize) throws -> PKDrawing {
        let drawing = try validate(data)
        guard size.width.isFinite, size.height.isFinite, size.width >= 100, size.height >= 100 else { throw NoteError.invalidFile }
        let bounds = drawing.bounds
        let scale = min(1, min(300, size.width * 0.75) / bounds.width, min(200, size.height * 0.35) / bounds.height)
        let x = (size.width - bounds.width * scale) / 2 - bounds.minX * scale
        let y = (size.height - bounds.height * scale) / 2 - bounds.minY * scale
        let placed = drawing.transformed(using: CGAffineTransform(a: scale, b: 0, c: 0, d: scale, tx: x, ty: y))
        // Fresh paths/strokes let the same saved element coexist with its earlier copies.
        return PKDrawing(strokes: placed.strokes.map { stroke in
            let path = PKStrokePath(controlPoints: Array(stroke.path), creationDate: stroke.path.creationDate)
            return PKStroke(ink: stroke.ink, path: path, transform: stroke.transform, mask: stroke.mask)
        })
    }
}
