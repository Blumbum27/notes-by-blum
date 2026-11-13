import Foundation
import CoreGraphics

enum PaperTint: String, Codable, CaseIterable, Identifiable, Hashable, Sendable {
    case white, ivory, blue, pink, mint
    var id: String { rawValue }
    var title: String {
        switch self {
        case .white: return "Белый"
        case .ivory: return "Кремовый"
        case .blue: return "Голубой"
        case .pink: return "Розовый"
        case .mint: return "Мятный"
        }
    }
    var rgb: (Double, Double, Double) {
        switch self {
        case .white: return (1, 1, 1)
        case .ivory: return (1, 0.96, 0.80)
        case .blue: return (0.88, 0.94, 1)
        case .pink: return (1, 0.89, 0.91)
        case .mint: return (0.87, 0.97, 0.90)
        }
    }
}

enum PaperStyle: String, Codable, CaseIterable, Identifiable, Hashable, Sendable {
    case blank, ruled, grid, dots
    var id: String { rawValue }
    var title: String {
        switch self {
        case .blank: return "Чистый лист"
        case .ruled: return "Линейка"
        case .grid: return "Клетка"
        case .dots: return "Точки"
        }
    }
}

struct TextBlock: Identifiable, Codable, Equatable, Sendable {
    var id = UUID()
    var text = ""
    var x: Double = 48
    var y: Double = 80
    var fontSize: Double = 20
    var background: PaperTint? = nil
}

struct PageImage: Identifiable, Codable, Equatable, Sendable {
    var id = UUID()
    var asset: String
    var x: Double = 48
    var y: Double = 120
    var width: Double = 240
    var height: Double = 180
}

struct NotePage: Identifiable, Codable, Equatable, Sendable {
    var id = UUID()
    var paper: PaperStyle = .ruled
    var paperTint: PaperTint? = nil
    var width: Double = 595
    var height: Double = 842
    var drawing: Data = Data()
    var pdfAsset: String?
    var pdfPage: Int?
    var bookmarked = false
    var texts: [TextBlock] = []
    var images: [PageImage] = []
    var paperTemplateID: String? = nil
    var paperSpacing: Double? = nil
    var paperMargin: Double? = nil
    var heading: String? = nil
    var studyCovers: [StudyCover]? = nil
    var size: CGSize { CGSize(width: width, height: height) }
}

struct StudyCover: Identifiable, Codable, Equatable, Sendable {
    var id = UUID()
    var rect: CGRect
}

struct Notebook: Identifiable, Codable, Equatable, Sendable {
    var id = UUID()
    var title: String
    var color: String = "teal"
    var folderID: UUID?
    var favorite = false
    var createdAt = Date()
    var updatedAt = Date()
    var deletedAt: Date?
    var pages: [NotePage] = [NotePage()]
}

struct NoteFolder: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String
}

struct Library: Codable, Equatable {
    var version = 1
    var notebooks: [Notebook] = []
    var folders: [NoteFolder] = []
    // Optional fields decode libraries created before this feature without a migration.
    var inkElements: [InkElement]? = nil
}

struct InkElement: Identifiable, Codable, Equatable, Sendable {
    var id = UUID()
    var title: String
    var drawing: Data
}

struct NotebookArchive: Codable {
    var version = 1
    var notebook: Notebook
    var assets: [String: Data]
}

enum NoteError: LocalizedError {
    case invalidFile, newerVersion, limitReached, emptyTitle, missingAsset(String)
    var errorDescription: String? {
        switch self {
        case .invalidFile: return "Не удалось прочитать документ. Возможно, файл повреждён или формат не поддерживается."
        case .newerVersion: return "Документ создан более новой версией приложения. Обновите приложение."
        case .limitReached: return "В бесплатной версии доступны 3 тетради, включая корзину. Экспортируйте и удалите ненужную тетрадь или подключите подписку."
        case .emptyTitle: return "Введите название."
        case .missingAsset(let name): return "Отсутствует вложение: \(name). Восстановите тетрадь из резервной копии."
        }
    }
}
