import UIKit

enum PaperTemplateRenderer {
    static func paint(_ page: NotePage, context: CGContext) {
        let size = page.size
        let rgb = (page.paperTint ?? .white).rgb
        UIColor(red: rgb.0, green: rgb.1, blue: rgb.2, alpha: 1).setFill()
        context.fill(CGRect(origin: .zero, size: size))
        context.saveGState()
        defer { context.restoreGState() }
        context.clip(to: CGRect(origin: .zero, size: size))
        // Darker than the former fixed gray: all five pastel backgrounds keep visible rules.
        let lineColor = UIColor(red: 0.56, green: 0.63, blue: 0.65, alpha: 0.58)
        lineColor.setStroke(); lineColor.setFill(); context.setLineWidth(0.6)
        let rawSpacing = page.paperSpacing ?? 24, rawMargin = page.paperMargin ?? 30
        let spacing = CGFloat(rawSpacing.isFinite ? min(48, max(16, rawSpacing)) : 24)
        let requestedMargin = CGFloat(rawMargin.isFinite ? min(64, max(16, rawMargin)) : 30)
        let margin = min(requestedMargin, max(0, (min(size.width, size.height) - 40) / 2))
        let content = CGRect(origin: .zero, size: size).insetBy(dx: margin, dy: margin)
        if let id = page.paperTemplateID, let layout = PaperCatalog.layouts.first(where: { $0.id == id }) {
            for item in layout.primitives { paint(item, in: content, spacing: spacing, context: context, lineColor: lineColor) }
        } else if page.paperSpacing == nil && page.paperMargin == nil && page.paperTemplateID == nil {
            legacy(page, context: context)
        } else {
            switch page.paper {
            case .blank: break
            case .ruled: ruled(in: content.insetBy(dx: 0, dy: spacing / 2), spacing: spacing, context: context)
            case .grid:
                for x in stride(from: content.minX, through: content.maxX, by: spacing) {
                    line(CGPoint(x: x, y: content.minY), CGPoint(x: x, y: content.maxY), context)
                }
                ruled(in: content, spacing: spacing, context: context)
            case .dots:
                for x in stride(from: content.minX, through: content.maxX, by: spacing) {
                    for y in stride(from: content.minY, through: content.maxY, by: spacing) {
                        context.fillEllipse(in: CGRect(x: x - 0.8, y: y - 0.8, width: 1.6, height: 1.6))
                    }
                }
            }
        }
    }

    private static func paint(_ item: PaperPrimitive, in content: CGRect, spacing: CGFloat,
                              context: CGContext, lineColor: UIColor) {
        let point = CGPoint(x: content.minX + content.width * item.x, y: content.minY + content.height * item.y)
        let rect = CGRect(origin: point, size: CGSize(width: content.width * (item.w ?? 0), height: content.height * (item.h ?? 0)))
        lineColor.setStroke(); lineColor.setFill()
        switch item.kind {
        case "line":
            line(point, CGPoint(x: content.minX + content.width * (item.toX ?? item.x), y: content.minY + content.height * (item.toY ?? item.y)), context)
        case "rect": context.stroke(rect)
        case "label":
            guard rect.height >= 8, rect.width > 0 else { return }
            let text = (item.text ?? "") as NSString
            var fontSize = min(CGFloat(item.fontSize ?? 12), rect.height * 0.8)
            let weight: UIFont.Weight = (item.fontSize ?? 12) >= 18 ? .semibold : .regular
            let naturalWidth = text.size(withAttributes: [.font: UIFont.systemFont(ofSize: fontSize, weight: weight)]).width
            if naturalWidth > rect.width { fontSize = max(6, fontSize * rect.width / naturalWidth) }
            text.draw(in: rect, withAttributes: [
                .font: UIFont.systemFont(ofSize: fontSize, weight: weight),
                .foregroundColor: UIColor(red: 0.25, green: 0.33, blue: 0.35, alpha: 1)
            ])
        case "ruled": ruled(in: rect, spacing: spacing, context: context)
        case "checklist":
            for y in stride(from: rect.minY + 10, to: rect.maxY, by: max(24, spacing * 1.4)) {
                context.stroke(CGRect(x: rect.minX, y: y - 7, width: 9, height: 9))
                line(CGPoint(x: rect.minX + 19, y: y + 3), CGPoint(x: rect.maxX, y: y + 3), context)
            }
        case "staff":
            let gap = min(9, max(5, spacing / 3))
            for y in stride(from: rect.minY, through: rect.maxY - 4 * gap, by: gap * 4 + 30) {
                for index in 0..<5 {
                    let baseline = y + CGFloat(index) * gap
                    line(CGPoint(x: rect.minX, y: baseline), CGPoint(x: rect.maxX, y: baseline), context)
                }
            }
        default: break
        }
    }

    private static func ruled(in rect: CGRect, spacing: CGFloat, context: CGContext) {
        guard rect.width > 0, rect.height > 0, spacing >= 12 else { return }
        for y in stride(from: rect.minY, through: rect.maxY, by: spacing) {
            line(CGPoint(x: rect.minX, y: y), CGPoint(x: rect.maxX, y: y), context)
        }
    }

    private static func line(_ start: CGPoint, _ end: CGPoint, _ context: CGContext) {
        context.move(to: start); context.addLine(to: end); context.strokePath()
    }

    private static func legacy(_ page: NotePage, context: CGContext) {
        // Preserve original coordinates for pages saved before configurable paper.
        switch page.paper {
        case .blank: break
        case .ruled:
            for y in stride(from: 72.0, to: page.height - 24, by: 28) {
                line(CGPoint(x: 30, y: y), CGPoint(x: page.width - 30, y: y), context)
            }
        case .grid:
            for x in stride(from: 24.0, to: page.width, by: 24) { line(CGPoint(x: x, y: 0), CGPoint(x: x, y: page.height), context) }
            for y in stride(from: 24.0, to: page.height, by: 24) { line(CGPoint(x: 0, y: y), CGPoint(x: page.width, y: y), context) }
        case .dots:
            for x in stride(from: 30.0, to: page.width - 15, by: 24) {
                for y in stride(from: 30.0, to: page.height - 15, by: 24) { context.fillEllipse(in: CGRect(x: x, y: y, width: 1.6, height: 1.6)) }
            }
        }
    }

    static func preview(_ configuration: PaperConfiguration, maxDimension: CGFloat = 300) -> UIImage {
        let page = configuration.makePage()
        let scale = maxDimension / max(page.size.width, page.size.height)
        let size = CGSize(width: page.size.width * scale, height: page.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 2
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            context.cgContext.scaleBy(x: scale, y: scale)
            paint(page, context: context.cgContext)
        }
    }
}
