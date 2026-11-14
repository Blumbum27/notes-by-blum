import PencilKit
import UIKit

/// Распознавание и построение фигур как обычных штрихов PencilKit: ластик, лассо и отмена работают с ними как с рукописью.
enum ShapeGeometry {
  static func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat { hypot(a.x - b.x, a.y - b.y) }

  static func densify(_ points: [CGPoint], step: CGFloat = 2) -> [CGPoint] {
    guard var previous = points.first else { return [] }
    var result = [previous]
    for point in points.dropFirst() {
      let length = distance(previous, point)
      let count = max(1, Int(length / step))
      for index in 1...count {
        let t = CGFloat(index) / CGFloat(count)
        result.append(CGPoint(x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t))
      }
      previous = point
    }
    return result
  }

  static func simplify(_ points: [CGPoint], tolerance: CGFloat) -> [CGPoint] {
    guard points.count > 2, let first = points.first, let last = points.last else { return points }
    var index = 0, maximum: CGFloat = 0
    for i in 1..<(points.count - 1) {
      let value = segmentDistance(points[i], first, last)
      if value > maximum { maximum = value; index = i }
    }
    guard maximum > tolerance else { return [first, last] }
    return simplify(Array(points[...index]), tolerance: tolerance).dropLast() + simplify(Array(points[index...]), tolerance: tolerance)
  }

  private static func segmentDistance(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> CGFloat {
    let length = distance(a, b)
    guard length > 0 else { return distance(p, a) }
    let t = max(0, min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (length * length)))
    return distance(p, CGPoint(x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)))
  }

  static func ellipse(in rect: CGRect) -> [CGPoint] {
    (0...96).map { index in
      let angle = CGFloat(index) / 96 * 2 * .pi
      return CGPoint(x: rect.midX + cos(angle) * rect.width / 2, y: rect.midY + sin(angle) * rect.height / 2)
    }
  }

  static func roundedRect(_ rect: CGRect) -> [CGPoint] {
    let radius = min(rect.width, rect.height) * 0.22
    let corners = [(CGPoint(x: rect.maxX - radius, y: rect.minY + radius), -CGFloat.pi / 2), (CGPoint(x: rect.maxX - radius, y: rect.maxY - radius), 0),
      (CGPoint(x: rect.minX + radius, y: rect.maxY - radius), CGFloat.pi / 2), (CGPoint(x: rect.minX + radius, y: rect.minY + radius), CGFloat.pi)]
    var points: [CGPoint] = []
    for (center, start) in corners {
      for index in 0...12 {
        let angle = start + CGFloat(index) / 12 * .pi / 2
        points.append(CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius))
      }
    }
    return points + [points[0]]
  }

  /// Фигура по перетаскиванию от start до end.
  static func drag(_ kind: String, from start: CGPoint, to end: CGPoint) -> [CGPoint] {
    let rect = CGRect(x: min(start.x, end.x), y: min(start.y, end.y), width: abs(end.x - start.x), height: abs(end.y - start.y))
    switch kind {
    case "ellipse": return ellipse(in: rect)
    case "triangle": return [CGPoint(x: rect.midX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.maxY), CGPoint(x: rect.midX, y: rect.minY)]
    case "diamond": return [CGPoint(x: rect.midX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.midY), CGPoint(x: rect.midX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.midY), CGPoint(x: rect.midX, y: rect.minY)]
    case "rounded": return roundedRect(rect)
    case "elbow": return [start, CGPoint(x: end.x, y: start.y), end]
    case "curve":
      let middle = (start.x + end.x) / 2
      return (0...48).map { index in
        let t = CGFloat(index) / 48, u = 1 - t
        let x = u * u * u * start.x + 3 * u * u * t * middle + 3 * u * t * t * middle + t * t * t * end.x
        let y = u * u * u * start.y + 3 * u * u * t * start.y + 3 * u * t * t * end.y + t * t * t * end.y
        return CGPoint(x: x, y: y)
      }
    default: return [rect.origin, CGPoint(x: rect.maxX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.maxY), rect.origin]
    }
  }

  /// Превращает нарисованный от руки контур в ровную линию, многоугольник или эллипс. nil — если фигура не узнана.
  static func recognize(_ points: [CGPoint]) -> [CGPoint]? {
    guard points.count > 3, let first = points.first, let last = points.last else { return nil }
    let xs = points.map(\.x), ys = points.map(\.y)
    let box = CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
    let size = max(box.width, box.height)
    guard size > 12 else { return nil }
    let length = zip(points, points.dropFirst()).reduce(0) { $0 + distance($1.0, $1.1) }
    let closed = distance(first, last) < max(18, size * 0.22)
    if !closed {
      if distance(first, last) / length > 0.9 { return snapLine(first, last) }
      let corners = simplify(points, tolerance: max(6, size * 0.07))
      return corners.count <= 4 ? corners : nil
    }
    let a = max(box.width / 2, 1), b = max(box.height / 2, 1)
    let error = points.reduce(0) { $0 + abs(hypot(($1.x - box.midX) / a, ($1.y - box.midY) / b) - 1) } / CGFloat(points.count)
    var corners = simplify(points, tolerance: size * 0.09)
    if corners.count > 1, distance(corners[0], corners[corners.count - 1]) < size * 0.25 { corners.removeLast() }
    if error < 0.09 || (corners.count > 5 && error < 0.2) {
      let square = abs(box.width - box.height) / size < 0.14
      let side = (box.width + box.height) / 2
      return ellipse(in: square ? CGRect(x: box.midX - side / 2, y: box.midY - side / 2, width: side, height: side) : box)
    }
    if corners.count == 3 { return corners + [corners[0]] }
    if corners.count == 4 {
      let middles = [CGPoint(x: box.midX, y: box.minY), CGPoint(x: box.maxX, y: box.midY), CGPoint(x: box.midX, y: box.maxY), CGPoint(x: box.minX, y: box.midY)]
      if corners.allSatisfy({ corner in middles.contains { distance($0, corner) < size * 0.2 } }) { return drag("diamond", from: box.origin, to: CGPoint(x: box.maxX, y: box.maxY)) }
      let right = (0..<4).allSatisfy { index in
        let p = corners[(index + 3) % 4], c = corners[index], n = corners[(index + 1) % 4]
        let angle = abs(atan2(p.y - c.y, p.x - c.x) - atan2(n.y - c.y, n.x - c.x)).truncatingRemainder(dividingBy: .pi)
        return abs(angle - .pi / 2) < 0.38
      }
      let edge = atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x)
      let aligned = abs(sin(2 * edge)) < 0.35
      if right && aligned { return drag("rectangle", from: box.origin, to: CGPoint(x: box.maxX, y: box.maxY)) }
      return corners + [corners[0]]
    }
    if corners.count <= 6, error > 0.2 { return corners + [corners[0]] }
    return error < 0.22 ? ellipse(in: box) : nil
  }

  private static func snapLine(_ a: CGPoint, _ b: CGPoint) -> [CGPoint] {
    let angle = atan2(b.y - a.y, b.x - a.x)
    let step = CGFloat.pi / 4
    let snapped = (angle / step).rounded() * step
    guard abs(angle - snapped) < 0.07 else { return [a, b] }
    let length = distance(a, b)
    return [a, CGPoint(x: a.x + cos(snapped) * length, y: a.y + sin(snapped) * length)]
  }

  /// Размер точки, который PencilKit ставит штриху ручки шириной 1 при обычной скорости (замер по штрихам PKInkingTool).
  static let inkPointScale: CGFloat = 2.18

  /// Скорость 100 pt/s: при более быстрых «виртуальных» точках ручка PencilKit истончает линию до пунктира.
  static func stroke(_ points: [CGPoint], ink: PKInk, width: CGFloat) -> PKStroke {
    let path = densify(points).enumerated().map { index, location in
      PKStrokePoint(location: location, timeOffset: TimeInterval(index) * 0.02, size: CGSize(width: width, height: width), opacity: 1, force: 1, azimuth: 0, altitude: .pi / 2)
    }
    return PKStroke(ink: ink, path: PKStrokePath(controlPoints: path, creationDate: Date()))
  }

  /// Стабилизация сглаживает траекторию, чувствительность к нажиму сжимает разброс толщины к среднему.
  static func adjust(_ stroke: PKStroke, stabilization: CGFloat, pressure: CGFloat) -> PKStroke {
    let points = Array(stroke.path)
    guard points.count > 2 else { return stroke }
    let window = Int(stabilization * 10)
    let meanWidth = points.reduce(0) { $0 + $1.size.width } / CGFloat(points.count)
    let meanHeight = points.reduce(0) { $0 + $1.size.height } / CGFloat(points.count)
    let adjusted = points.enumerated().map { index, point -> PKStrokePoint in
      var location = point.location
      if window > 0, index > 0, index < points.count - 1 {
        let range = max(0, index - window)...min(points.count - 1, index + window)
        location = CGPoint(x: range.reduce(0) { $0 + points[$1].location.x } / CGFloat(range.count), y: range.reduce(0) { $0 + points[$1].location.y } / CGFloat(range.count))
      }
      let size = CGSize(width: meanWidth + (point.size.width - meanWidth) * pressure, height: meanHeight + (point.size.height - meanHeight) * pressure)
      return PKStrokePoint(location: location, timeOffset: point.timeOffset, size: size, opacity: point.opacity, force: point.force, azimuth: point.azimuth, altitude: point.altitude)
    }
    return PKStroke(ink: stroke.ink, path: PKStrokePath(controlPoints: adjusted, creationDate: stroke.path.creationDate), transform: stroke.transform, mask: stroke.mask)
  }
}

/// Слой поверх страницы для инструментов, которые не рисуют штрих напрямую: фигуры перетаскиванием, лента, лазерная указка.
final class ToolOverlay: UIView {
  let preview = CAShapeLayer()
  let tape = UIView()
  override init(frame: CGRect) {
    super.init(frame: frame)
    preview.fillColor = UIColor.clear.cgColor
    preview.lineCap = .round
    preview.lineJoin = .round
    layer.addSublayer(preview)
    tape.isHidden = true
    tape.layer.cornerRadius = 2
    addSubview(tape)
  }
  required init?(coder: NSCoder) { fatalError() }

  func showPath(_ points: [CGPoint], color: UIColor, width: CGFloat) {
    let path = UIBezierPath()
    if let first = points.first { path.move(to: first); points.dropFirst().forEach { path.addLine(to: $0) } }
    preview.strokeColor = color.cgColor
    preview.lineWidth = width
    preview.path = path.cgPath
  }

  func laser(_ points: [CGPoint], dot: Bool) {
    preview.strokeColor = UIColor.systemRed.cgColor
    preview.shadowColor = UIColor.systemRed.cgColor
    preview.shadowOpacity = 0.9
    preview.shadowRadius = 6
    preview.shadowOffset = .zero
    preview.opacity = 1
    preview.removeAllAnimations()
    if dot, let last = points.last {
      preview.lineWidth = 0
      preview.fillColor = UIColor.systemRed.cgColor
      preview.path = UIBezierPath(ovalIn: CGRect(x: last.x - 6, y: last.y - 6, width: 12, height: 12)).cgPath
    } else {
      preview.fillColor = UIColor.clear.cgColor
      showPath(points, color: .systemRed, width: 4)
    }
  }

  func fadeOut() {
    let animation = CABasicAnimation(keyPath: "opacity")
    animation.fromValue = 1
    animation.toValue = 0
    animation.beginTime = CACurrentMediaTime() + 0.6
    animation.duration = 0.45
    animation.fillMode = .forwards
    animation.isRemovedOnCompletion = false
    preview.add(animation, forKey: "fade")
  }

  func clear() {
    preview.removeAllAnimations()
    preview.path = nil
    preview.shadowOpacity = 0
    preview.fillColor = UIColor.clear.cgColor
    tape.isHidden = true
  }
}

extension UIColor {
  /// Цвет заметки из "#RRGGBB"; "stars" — узор ленты со звёздами.
  static func note(_ value: String) -> UIColor {
    if value == "stars" { return starsPattern }
    let number = UInt64(value.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
    return UIColor(red: CGFloat((number >> 16) & 255) / 255, green: CGFloat((number >> 8) & 255) / 255, blue: CGFloat(number & 255) / 255, alpha: 1)
  }

  private static let starsPattern: UIColor = {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 22, height: 22)).image { context in
      UIColor(red: 0.16, green: 0.2, blue: 0.42, alpha: 1).setFill()
      context.fill(CGRect(x: 0, y: 0, width: 22, height: 22))
      let star = UIImage(systemName: "star.fill")?.withTintColor(UIColor(red: 1, green: 0.84, blue: 0.35, alpha: 1), renderingMode: .alwaysOriginal)
      star?.draw(in: CGRect(x: 3, y: 3, width: 7, height: 7))
      star?.draw(in: CGRect(x: 13, y: 12, width: 6, height: 6))
    }
    return UIColor(patternImage: image)
  }()
}
