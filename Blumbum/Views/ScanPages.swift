import SwiftUI
import VisionKit

struct ScanPages: UIViewControllerRepresentable {
    let complete: (Result<[UIImage], Error>?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(complete:complete) }
    func makeUIViewController(context:Context) -> VNDocumentCameraViewController {
        let scanner = VNDocumentCameraViewController()
        scanner.delegate = context.coordinator
        return scanner
    }
    func updateUIViewController(_ view:VNDocumentCameraViewController,context:Context) {}
    final class Coordinator:NSObject,VNDocumentCameraViewControllerDelegate {
        let complete:(Result<[UIImage],Error>?) -> Void
        init(complete:@escaping (Result<[UIImage],Error>?) -> Void) { self.complete = complete }
        func documentCameraViewControllerDidCancel(_ controller:VNDocumentCameraViewController) { complete(nil) }
        func documentCameraViewController(_ controller:VNDocumentCameraViewController,didFailWithError error:Error) { complete(.failure(error)) }
        func documentCameraViewController(_ controller:VNDocumentCameraViewController,didFinishWith scan:VNDocumentCameraScan) {
            guard (1...50).contains(scan.pageCount) else { complete(.failure(NoteError.invalidFile)); return }
            complete(.success((0..<scan.pageCount).map { scan.imageOfPage(at:$0) }))
        }
    }
}
