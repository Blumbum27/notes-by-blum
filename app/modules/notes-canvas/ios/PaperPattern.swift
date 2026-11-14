import UIKit

final class PaperView: UIView {
  var pattern = "grid"
  override func draw(_ rect: CGRect) {
    guard pattern != "blank", let context = UIGraphicsGetCurrentContext() else { return }
    context.setStrokeColor(UIColor.systemGray3.withAlphaComponent(0.65).cgColor)
    context.setFillColor(UIColor.systemGray2.cgColor)
    context.setLineWidth(0.5)
    let step: CGFloat = pattern == "ruled" ? 28 : 20
    if pattern == "dots" {
      for x in stride(from: step, to: rect.width, by: step) {
        for y in stride(from: step, to: rect.height, by: step) {
          context.fillEllipse(in: CGRect(x: x, y: y, width: 1.5, height: 1.5))
        }
      }
    } else {
      for y in stride(from: step, to: rect.height, by: step) {
        context.move(to: CGPoint(x: 0, y: y)); context.addLine(to: CGPoint(x: rect.width, y: y))
      }
      if pattern == "grid" {
        for x in stride(from: step, to: rect.width, by: step) {
          context.move(to: CGPoint(x: x, y: 0)); context.addLine(to: CGPoint(x: x, y: rect.height))
        }
      }
      context.strokePath()
    }
  }
}
