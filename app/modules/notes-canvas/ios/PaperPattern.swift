import UIKit

final class PaperView: UIView {
  var pattern = "grid"
  override func draw(_ rect: CGRect) {
    guard pattern != "blank", let context = UIGraphicsGetCurrentContext() else { return }
    let line = UIColor.systemGray3.withAlphaComponent(0.65).cgColor
    context.setStrokeColor(line)
    context.setFillColor(UIColor.systemGray2.cgColor)
    context.setLineWidth(0.5)
    func horizontal(_ y: CGFloat, from x0: CGFloat = 0, to x1: CGFloat? = nil) {
      context.move(to: CGPoint(x: x0, y: y)); context.addLine(to: CGPoint(x: x1 ?? rect.width, y: y))
    }
    func vertical(_ x: CGFloat, from y0: CGFloat = 0, to y1: CGFloat? = nil) {
      context.move(to: CGPoint(x: x, y: y0)); context.addLine(to: CGPoint(x: x, y: y1 ?? rect.height))
    }
    switch pattern {
    case "dots":
      for x in stride(from: 20, to: rect.width, by: 20) {
        for y in stride(from: 20, to: rect.height, by: 20) { context.fillEllipse(in: CGRect(x: x, y: y, width: 1.5, height: 1.5)) }
      }
    case "grid":
      for y in stride(from: 20, to: rect.height, by: 20) { horizontal(y) }
      for x in stride(from: 20, to: rect.width, by: 20) { vertical(x) }
      context.strokePath()
    case "ruledWide":
      for y in stride(from: 64, to: rect.height, by: 36) { horizontal(y) }
      context.strokePath()
    case "cornell":
      let summary = rect.height * 0.8, cue = rect.width * 0.28
      for y in stride(from: 64, to: summary, by: 28) { horizontal(y, from: cue) }
      context.strokePath()
      context.setLineWidth(1)
      horizontal(48); vertical(cue, from: 48, to: summary); horizontal(summary)
      context.strokePath()
    case "legal":
      for y in stride(from: 64, to: rect.height, by: 28) { horizontal(y) }
      context.strokePath()
      context.setStrokeColor(UIColor.systemRed.withAlphaComponent(0.45).cgColor)
      vertical(66); vertical(70)
      context.strokePath()
    case "music":
      var top: CGFloat = 60
      while top + 32 < rect.height - 30 {
        for index in 0..<5 { horizontal(top + CGFloat(index) * 8, from: 36, to: rect.width - 36) }
        top += 72
      }
      context.strokePath()
    default:
      for y in stride(from: 28, to: rect.height, by: 28) { horizontal(y) }
      context.strokePath()
    }
  }
}
