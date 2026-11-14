import ExpoModulesCore
import PDFKit

public final class DocumentImportModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DocumentImport")
    AsyncFunction("pdfPageCount") { (uri: String) -> Int in
      guard let url = URL(string: uri), let pdf = PDFDocument(url: url),
            !pdf.isLocked, pdf.pageCount > 0 else {
        throw Exception(name: "InvalidPDF", description: "Не удалось открыть PDF. Выберите PDF без пароля.")
      }
      return pdf.pageCount
    }
  }
}
