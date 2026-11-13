import Foundation
import UIKit
import ImageIO

enum ImageLoader {
    static let maxBytes = 30_000_000
    static let maxPixels = 100_000_000.0

    static func validate(_ data: Data) throws {
        guard !data.isEmpty, data.count <= maxBytes,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
              width.doubleValue > 0, height.doubleValue > 0,
              width.doubleValue * height.doubleValue <= maxPixels else { throw NoteError.invalidFile }
    }

    static func thumbnail(_ data: Data, maxDimension: Int = 2000) throws -> UIImage {
        guard (1...4096).contains(maxDimension) else { throw NoteError.invalidFile }
        try validate(data)
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxDimension,
                kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary) else { throw NoteError.invalidFile }
        return UIImage(cgImage: image)
    }

    static func prepareForStorage(_ data: Data) throws -> (data: Data, suffix: String, size: CGSize) {
        let image = try thumbnail(data)
        let alpha = image.cgImage?.alphaInfo ?? .none
        let hasAlpha = [CGImageAlphaInfo.first, .last, .premultipliedFirst, .premultipliedLast].contains(alpha)
        let encoded = hasAlpha ? image.pngData() : image.jpegData(compressionQuality: 0.86)
        guard let encoded, encoded.count <= maxBytes else { throw NoteError.invalidFile }
        return (encoded, hasAlpha ? "png" : "jpg", image.size)
    }

    static func fittedRect(image: CGSize, page: CGSize) throws -> CGRect {
        guard image.width.isFinite, image.height.isFinite, page.width.isFinite, page.height.isFinite,
              image.width > 0, image.height > 0, page.width >= 100, page.height >= 100 else { throw NoteError.invalidFile }
        let margin = min(48, min(page.width, page.height) * 0.1)
        let scale = min(1, min(280, page.width - 2 * margin) / image.width, (page.height - 2 * margin) / image.height)
        let size = CGSize(width: max(1, image.width * scale), height: max(1, image.height * scale))
        return CGRect(x: (page.width - size.width) / 2, y: (page.height - size.height) / 2, width: size.width, height: size.height)
    }
}
