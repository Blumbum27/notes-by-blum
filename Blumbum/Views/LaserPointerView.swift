import UIKit

/// Presentation ink lives only in these layers. It never enters PKDrawing or exports.
final class LaserPointerView: UIView {
    private let trail = CAShapeLayer()
    private let dot = CAShapeLayer()
    private var path = UIBezierPath()
    private var fadeTask: Task<Void, Never>?
    private var samples = 0

    override init(frame: CGRect) {
        super.init(frame: frame)
        isOpaque = false
        backgroundColor = .clear
        clipsToBounds = true
        isMultipleTouchEnabled = false
        accessibilityLabel = "Лазерная указка. Временный след, не сохраняется."
        trail.strokeColor = UIColor.systemRed.cgColor
        trail.fillColor = UIColor.clear.cgColor
        trail.lineWidth = 3
        trail.lineCap = .round
        trail.lineJoin = .round
        dot.fillColor = UIColor.systemRed.cgColor
        dot.shadowColor = UIColor.systemRed.cgColor
        dot.shadowOpacity = 0.8
        dot.shadowRadius = 5
        layer.addSublayer(trail)
        layer.addSublayer(dot)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func clear() {
        fadeTask?.cancel(); fadeTask = nil
        trail.removeAllAnimations(); dot.removeAllAnimations()
        trail.path = nil; dot.path = nil
        path = UIBezierPath(); samples = 0
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let point = touches.first?.location(in: self) else { return }
        clear()
        trail.opacity = 1; dot.opacity = 1
        path.move(to: point)
        updateDot(point)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first else { return }
        for sample in event?.coalescedTouches(for: touch) ?? [touch] {
            let point = sample.location(in: self)
            if samples >= 512 { path = UIBezierPath(); path.move(to: point); samples = 0 }
            path.addLine(to: point); samples += 1
            updateDot(point)
        }
        trail.path = path.cgPath
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        fadeTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .milliseconds(120)) } catch { return }
            guard let self else { return }
            let fade = CABasicAnimation(keyPath: "opacity")
            fade.fromValue = 1; fade.toValue = 0; fade.duration = 0.65
            self.trail.opacity = 0; self.dot.opacity = 0
            self.trail.add(fade, forKey: "fade"); self.dot.add(fade, forKey: "fade")
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { clear() }

    private func updateDot(_ point: CGPoint) {
        CATransaction.begin(); CATransaction.setDisableActions(true)
        dot.path = UIBezierPath(ovalIn: CGRect(x: point.x - 5, y: point.y - 5, width: 10, height: 10)).cgPath
        CATransaction.commit()
    }
}
