import Foundation
import CoreGraphics

/// Geometry only: no text recognition, network or dependence on display zoom.
enum InkGestureGeometry {
    static func bounds(_ points: [CGPoint]) -> CGRect? {
        guard let first = points.first, points.allSatisfy({ $0.x.isFinite && $0.y.isFinite }) else { return nil }
        var minX = first.x, maxX = first.x, minY = first.y, maxY = first.y
        for point in points.dropFirst() {
            minX = min(minX, point.x); maxX = max(maxX, point.x)
            minY = min(minY, point.y); maxY = max(maxY, point.y)
        }
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }

    static func scribbleRegion(points: [CGPoint], duration: TimeInterval) -> CGRect? {
        guard points.count >= 12, duration.isFinite, (0.12...2.2).contains(duration),
              let rect = bounds(points), (36...420).contains(rect.width),
              rect.height >= 6, rect.height <= min(120, rect.width * 0.9) else { return nil }
        let horizontalTravel = zip(points, points.dropFirst()).reduce(CGFloat.zero) { $0 + abs($1.1.x - $1.0.x) }
        guard horizontalTravel >= rect.width * 3.4, horizontalTravel <= rect.width * 12 else { return nil }
        // Only count substantial reversals spanning at least half the whole gesture.
        // W, ordinary hatching and handwritten letters normally advance in one direction.
        let sweep = rect.width * 0.55
        let origin = points[0].x
        var direction = 0
        var extreme = origin
        var reversals = 0
        for point in points.dropFirst() {
            let x = point.x
            if direction == 0 {
                if abs(x - origin) >= sweep { direction = x > origin ? 1 : -1; extreme = x }
            } else if direction > 0 {
                if x > extreme { extreme = x }
                else if extreme - x >= sweep { reversals += 1; direction = -1; extreme = x }
            } else {
                if x < extreme { extreme = x }
                else if x - extreme >= sweep { reversals += 1; direction = 1; extreme = x }
            }
        }
        guard reversals >= 3 else { return nil }
        return rect.insetBy(dx: -4, dy: -4)
    }

    static func substantiallyCovered(_ points: [CGPoint], by region: CGRect) -> Bool {
        guard !points.isEmpty, bounds(points) != nil else { return false }
        let covered = points.filter { region.contains($0) }.count
        return Double(covered) / Double(points.count) >= 0.65
    }

    static func straightLine(_ points: [CGPoint]) -> (start: CGPoint, end: CGPoint)? {
        guard points.count >= 2, bounds(points) != nil, let start = points.first, let end = points.last else { return nil }
        let dx = end.x - start.x, dy = end.y - start.y
        let length = hypot(dx, dy)
        guard length >= 60 else { return nil }
        let travelled = zip(points, points.dropFirst()).reduce(CGFloat.zero) { $0 + hypot($1.1.x - $1.0.x, $1.1.y - $1.0.y) }
        guard travelled > 0, length / travelled >= 0.985 else { return nil }
        let deviation = points.map { abs(dy * ($0.x - start.x) - dx * ($0.y - start.y)) / length }.max() ?? 0
        guard deviation <= min(5, length * 0.025) else { return nil }
        let angle = atan2(dy, dx)
        let snapped = (angle / (.pi / 4)).rounded() * (.pi / 4)
        if abs(angle - snapped) <= .pi / 45 {
            return (start, CGPoint(x: start.x + cos(snapped) * length, y: start.y + sin(snapped) * length))
        }
        return (start, end)
    }
}
