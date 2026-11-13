import SwiftUI
import PencilKit

struct ReferencePane: View {
    @EnvironmentObject private var store: LibraryStore
    let editorID: UUID
    @Binding var visible: Bool
    @AppStorage("referenceNotebook") private var saved = ""
    @State private var index = 0
    @State private var image: UIImage?
    @State private var issue: String?
    private var options: [Notebook] { store.library.notebooks.filter { $0.id != editorID && $0.deletedAt == nil } }
    private var note: Notebook? { options.first { $0.id.uuidString == saved } ?? options.first }
    var body: some View {
        VStack {
            HStack {
                Menu(note?.title ?? "Выбрать тетрадь") {
                    ForEach(options) { item in Button(item.title) { saved = item.id.uuidString; index = 0 } }
                }
                Spacer()
                Button { visible = false } label: { Image(systemName:"xmark") }.accessibilityLabel("Закрыть вторую тетрадь")
            }
            if let note {
                let position = min(index,note.pages.count-1)
                let page = note.pages[position]
                ScrollView([.vertical,.horizontal]) {
                    if let image { Image(uiImage:image).resizable().scaledToFit().frame(width:CGFloat(width)) }
                    if let issue { Text(issue) }
                }
                HStack {
                    Button { index = position-1 } label:{ Image(systemName:"chevron.left") }.disabled(position==0)
                    Text("\(position+1) / \(note.pages.count)")
                    Button { index = position+1 } label:{ Image(systemName:"chevron.right") }.disabled(position+1>=note.pages.count)
                    Stepper("Масштаб",value:$width,in:160...1100,step:80).labelsHidden()
                }.task(id: page) {
                    do {
                        let base = try PageRenderer.background(page,store:store)
                        let ink = page.drawing.isEmpty ? PKDrawing() : try PKDrawing(data:page.drawing)
                        let rect = CGRect(origin:.zero,size:page.size)
                        let format = UIGraphicsImageRendererFormat(); format.scale = min(2,1600/max(rect.width,rect.height))
                        image = UIGraphicsImageRenderer(size:page.size,format:format).image { ctx in
                            base.draw(in:rect); ink.image(from:rect,scale:format.scale).draw(in:rect)
                            UIColor.systemOrange.setFill(); for cover in page.studyCovers ?? [] { ctx.fill(cover.rect) }
                        }; issue = nil
                    } catch { image = nil; issue = error.localizedDescription }
                }
            } else { Text("Создайте вторую тетрадь для просмотра рядом.") }
        }.padding(8)
    }
    @State private var width = 320
}
