import SwiftUI
import PencilKit

struct SheetWorkspace: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let notebookID: UUID
    let original: NotePage
    let readOnly: Bool
    @State private var draft: NotePage
    @State private var preview: UIImage?
    @State private var mode = "lasso"
    @State private var points: [CGPoint] = []
    @State private var strokes = Set<Int>()
    @State private var texts = Set<UUID>()
    @State private var pictures = Set<UUID>()
    @State private var inkEnabled = true
    @State private var textEnabled = true
    @State private var picturesEnabled = true
    @State private var revealed = Set<UUID>()
    @State private var editText = ""
    @State private var editing: UUID?
    @State private var issue: String?
    @State private var recognized = false
    @State private var share: SharedFile?

    init(notebookID: UUID, original: NotePage, readOnly: Bool) {
        self.notebookID = notebookID; self.original = original; self.readOnly = readOnly
        _draft = State(initialValue: original)
        _mode = State(initialValue: readOnly ? "study" : "lasso")
    }
    var body: some View {
        NavigationStack {
            VStack {
                Picker("Инструмент", selection: $mode) {
                    if !readOnly {
                        Text("Лассо").tag("lasso"); Text("Сдвиг").tag("move"); Text("Лента").tag("tape")
                    }
                    Text("Проверка").tag("study")
                }.pickerStyle(.segmented).padding(.horizontal)
                GeometryReader { geo in
                    let scale = min(geo.size.width / draft.width, geo.size.height / draft.height)
                    ZStack(alignment: .topLeading) {
                        if let preview { Image(uiImage: preview).resizable() }
                        ForEach(draft.studyCovers ?? []) { cover in
                            Rectangle().fill(revealed.contains(cover.id) ? Color.orange.opacity(0.12) : Color.orange)
                                .frame(width: cover.rect.width * scale, height: cover.rect.height * scale)
                                .position(x: cover.rect.midX * scale, y: cover.rect.midY * scale)
                        }
                        Canvas { ctx, _ in
                            var path = Path()
                            for (i,p) in points.enumerated() {
                                let at = CGPoint(x:p.x * scale,y:p.y * scale)
                                if i == 0 { path.move(to: at) } else { path.addLine(to: at) }
                            }
                            ctx.stroke(path, with: .color(.blue), lineWidth: 2)
                        }
                    }
                    .frame(width: draft.width * scale, height: draft.height * scale)
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                        let p = CGPoint(x: value.location.x / scale, y: value.location.y / scale)
                        if points.isEmpty || hypot(p.x - points.last!.x, p.y - points.last!.y) > 1 { points.append(p) }
                    }.onEnded { _ in finishGesture() })
                    .frame(maxWidth: .infinity,maxHeight: .infinity)
                }
                if !readOnly && (mode == "lasso" || mode == "move") {
                    HStack {
                        Menu("Захват") {
                            Toggle("Рукопись", isOn: $inkEnabled); Toggle("Текст", isOn: $textEnabled); Toggle("Фото", isOn: $picturesEnabled)
                        }
                        Text("Выбрано: \(strokes.count + texts.count + pictures.count)")
                        Menu("Действия") {
                            Button("Увеличить на 10%") { transform(scale: 1.1) }
                            Button("Уменьшить на 10%") { transform(scale: 1/1.1) }
                            Button("Дублировать") { transform(dx: 12, dy: 12, copy: true) }
                            Button("Редактировать текст") {
                                if let text = draft.texts.first(where: { texts.contains($0.id) }) { editText = text.text; editing = text.id }
                            }.disabled(texts.count != 1)
                            Button("Распознать рукопись") { recognize() }.disabled(strokes.isEmpty)
                        }.disabled(strokes.isEmpty && texts.isEmpty && pictures.isEmpty)
                    }
                }
                if let issue { Text(issue).font(.caption).foregroundStyle(.red) }
            }.padding(8).navigationTitle("Работа с листом")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Закрыть") { dismiss() } }
                    ToolbarItem(placement: .primaryAction) { Button("PNG") { exportPNG() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Сохранить") { save() }.disabled(readOnly || draft == original) }
                }
                .task(id: draft) { render() }
                .alert("Текст", isPresented: Binding(get: { editing != nil }, set: { if !$0 { editing = nil } })) {
                    TextField("Текст", text: $editText)
                    Button("Применить") { if let i = draft.texts.firstIndex(where: { $0.id == editing }) { draft.texts[i].text = editText }; editing = nil }
                    Button("Отмена", role: .cancel) { editing = nil }
                }
                .sheet(isPresented: $recognized) {
                    NavigationStack {
                        TextEditor(text: $editText).padding().navigationTitle("Распознанный текст")
                            .toolbar {
                                Button("Копировать") { UIPasteboard.general.string = editText }
                                Button("Заменить") { replaceInk(); recognized = false }.disabled(editText.isEmpty)
                                Button("Закрыть") { recognized = false }
                            }
                    }
                }.sheet(item: $share) { ShareSheet(url: $0.url) }
        }
    }
    private var ink: PKDrawing { (try? PKDrawing(data: draft.drawing)) ?? PKDrawing() }
    private func render() {
        do {
            let background = try PageRenderer.background(draft, store: store)
            let rect = CGRect(origin: .zero, size: draft.size)
            let format = UIGraphicsImageRendererFormat(); format.scale = min(2, 2048 / max(rect.width,rect.height))
            preview = UIGraphicsImageRenderer(size: draft.size, format: format).image { _ in
                background.draw(in: rect); ink.image(from: rect, scale: format.scale).draw(in: rect)
            }
        } catch { issue = error.localizedDescription; preview = nil }
    }
    private func finishGesture() {
        defer { points = [] }
        guard let a = points.first, let b = points.last else { return }
        let rect = CGRect(x:min(a.x,b.x),y:min(a.y,b.y),width:abs(b.x-a.x),height:abs(b.y-a.y)).intersection(CGRect(origin:.zero,size:draft.size))
        if mode == "study" {
            if let cover = draft.studyCovers?.last(where: { $0.rect.contains(b) }) {
                if !revealed.insert(cover.id).inserted { revealed.remove(cover.id) }
            }
        } else if !readOnly {
            switch mode {
            case "move": transform(dx:b.x-a.x,dy:b.y-a.y)
            case "tape":
                if rect.width > 5 && rect.height > 5 { draft.studyCovers = (draft.studyCovers ?? []) + [StudyCover(rect: rect)] }
                else if let cover = draft.studyCovers?.last(where: { $0.rect.contains(b) }) { draft.studyCovers?.removeAll { $0.id == cover.id } }
            default:
                var path = Path(); path.move(to:a); points.dropFirst().forEach { path.addLine(to:$0) }; path.closeSubpath()
                let tap = points.count < 3 || (path.boundingRect.width < 6 && path.boundingRect.height < 6)
                func hit(_ box: CGRect) -> Bool { tap ? box.insetBy(dx:-4,dy:-4).contains(b) : path.contains(CGPoint(x:box.midX,y:box.midY)) }
                strokes = inkEnabled ? Set(ink.strokes.indices.filter { hit(ink.strokes[$0].renderBounds) }) : []
                pictures = picturesEnabled ? Set(draft.images.filter { hit(CGRect(x:$0.x,y:$0.y,width:$0.width,height:$0.height)) }.map(\.id)) : []
                texts = textEnabled ? Set(draft.texts.filter { hit(CGRect(x:$0.x,y:$0.y,width:min(240,max(30,draft.width-$0.x)),height:$0.fontSize * 1.5)) }.map(\.id)) : []
                if !strokes.isEmpty || !texts.isEmpty || !pictures.isEmpty { mode = "move" }
            }
        }
    }
    private func transform(dx: CGFloat = 0, dy: CGFloat = 0, scale: CGFloat = 1, copy: Bool = false) {
        let source = ink.strokes
        let selected = source.indices.filter(strokes.contains)
        let selectedText = draft.texts.filter { texts.contains($0.id) }
        let selectedImages = draft.images.filter { pictures.contains($0.id) }
        var bounds = CGRect.null
        selected.forEach { bounds = bounds.union(source[$0].renderBounds) }
        selectedText.forEach { bounds = bounds.union(CGRect(x:$0.x,y:$0.y,width:1,height:$0.fontSize)) }
        selectedImages.forEach { bounds = bounds.union(CGRect(x:$0.x,y:$0.y,width:$0.width,height:$0.height)) }
        guard !bounds.isNull else { return }
        let t = CGAffineTransform(a:scale,b:0,c:0,d:scale,tx:dx+bounds.midX*(1-scale),ty:dy+bounds.midY*(1-scale))
        var result = source
        for i in selected {
            let changed = PKDrawing(strokes:[source[i]]).transformed(using:t).strokes[0]
            if copy {
                let path = PKStrokePath(controlPoints:Array(changed.path),creationDate:Date())
                result.append(PKStroke(ink:changed.ink,path:path,transform:changed.transform,mask:changed.mask))
            } else { result[i] = changed }
        }
        if !selected.isEmpty { draft.drawing = PKDrawing(strokes:result).dataRepresentation() }
        for var item in selectedText {
            let p = CGPoint(x:item.x,y:item.y).applying(t); item.x = p.x; item.y = p.y; item.fontSize = min(96,max(8,item.fontSize * scale))
            if copy { item.id = UUID(); draft.texts.append(item) }
            else if let i = draft.texts.firstIndex(where: { $0.id == item.id }) { draft.texts[i] = item }
        }
        for var item in selectedImages {
            let p = CGPoint(x:item.x,y:item.y).applying(t); item.x = p.x; item.y = p.y; item.width *= scale; item.height *= scale
            if copy { item.id = UUID(); draft.images.append(item) }
            else if let i = draft.images.firstIndex(where: { $0.id == item.id }) { draft.images[i] = item }
        }
    }
    private func recognize() {
        var part = NotePage()
        part.drawing = PKDrawing(strokes:ink.strokes.enumerated().filter { strokes.contains($0.offset) }.map(\.element)).dataRepresentation()
        Task {
            do { editText = try await PageTextReader().text(part,pdfURL:nil); recognized = true }
            catch { issue = error.localizedDescription }
        }
    }
    private func replaceInk() {
        let all = ink.strokes
        let box = PKDrawing(strokes:all.enumerated().filter { strokes.contains($0.offset) }.map(\.element)).bounds
        guard !box.isNull else { return }
        draft.texts.append(TextBlock(text:editText,x:box.minX,y:box.minY))
        draft.drawing = PKDrawing(strokes:all.enumerated().filter { !strokes.contains($0.offset) }.map(\.element)).dataRepresentation()
        strokes = []
    }
    private func save() {
        guard let current = store.notebook(notebookID)?.pages.first(where:{ $0.id == original.id }), current == original else {
            issue = "Страница изменилась. Откройте её заново."; return
        }
        if store.updatePage(notebookID,original.id,{ $0 = draft }) && store.flush() { dismiss() }
        else { issue = store.error }
    }
    private func exportPNG() {
        render()
        guard let preview else { return }
        let url: URL
        do {
            url = try store.exportURL(extension:"png")
            let rect = CGRect(origin:.zero,size:preview.size)
            let format = UIGraphicsImageRendererFormat(); format.scale = preview.scale
            let data = UIGraphicsImageRenderer(size:rect.size,format:format).pngData { ctx in
                preview.draw(in:rect)
                UIColor.systemOrange.setFill()
                for cover in draft.studyCovers ?? [] where !revealed.contains(cover.id) { ctx.fill(cover.rect) }
            }
            try data.write(to:url,options:.atomic); share = SharedFile(url:url)
        } catch { issue = error.localizedDescription }
    }
}
