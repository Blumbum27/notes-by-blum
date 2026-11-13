import SwiftUI
import UIKit

struct PageThumbnail: View {
    @EnvironmentObject private var store: LibraryStore
    let page: NotePage
    @State private var image: UIImage?
    @State private var failed = false
    @State private var revision = UUID()

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4).fill(.white)
            if let image {
                Image(uiImage: image).resizable().scaledToFit().padding(2)
            } else if failed {
                Image(systemName: "exclamationmark.triangle").foregroundStyle(.secondary)
            } else { ProgressView().controlSize(.mini) }
        }.frame(width: 52, height: 72)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(.gray.opacity(0.25)))
            .accessibilityHidden(true)
            .onChange(of: page) { old, new in
                if old.paper != new.paper || old.paperTint != new.paperTint || old.paperTemplateID != new.paperTemplateID || old.paperSpacing != new.paperSpacing || old.paperMargin != new.paperMargin || old.width != new.width || old.height != new.height || old.drawing != new.drawing || old.texts != new.texts || old.images != new.images { revision = UUID() }
            }
            .task(id: revision) {
                image = nil; failed = false
                do { image = try await PageRenderer.thumbnail(page, store: store) }
                catch { if !Task.isCancelled { failed = true } }
            }
    }
}
