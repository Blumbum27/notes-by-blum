import SwiftUI
import PencilKit

private let penTypes: [PKInk.InkType] = [.pen,.pencil,.marker,.monoline,.fountainPen,.watercolor,.crayon]

private struct SavedPen: Codable,Identifiable {
    var id = UUID()
    var title: String
    var type: Int
    var red: Double
    var green: Double
    var blue: Double
    var alpha: Double
    var width: Double
}

struct WritingSettingsView: View {
    @ObservedObject var session: WritingSession
    @Environment(\.dismiss) private var dismiss
    @AppStorage("scribbleErase") private var scribbleErase = true
    @AppStorage("straightenLines") private var straightenLines = false
    @AppStorage("gestureHaptics") private var haptics = true
    @AppStorage("showQuickTools") private var showQuickTools = true
    @AppStorage("quickPenWidth") private var quickPenWidth = 2.0
    @AppStorage("fingerDrawing") private var fingerDrawing = true
    @AppStorage("savedPenPalette") private var penData = Data()
    @State private var penName = ""
    private var pens: [SavedPen] { (try? JSONDecoder().decode([SavedPen].self,from:penData)) ?? [] }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Стирать зачеркиванием", isOn: $scribbleErase).accessibilityIdentifier("writing.scribbleErase")
                    Text("Быстро проведите ручкой несколько раз влево-вправо поверх рукописи. Удаляются целые штрихи, большая часть которых попала под жест. Одна линия или подчёркивание не стирают запись. Фото, текст, PDF, маркер, акварель и мелок сохраняются.")
                        .font(.caption).foregroundStyle(.secondary)
                    Toggle("Выпрямлять длинные линии", isOn: $straightenLines)
                    Text("Почти прямые линии длиннее примерно 60 пунктов выпрямляются после отрыва пера. Близкие к горизонтали, вертикали и диагонали 45° линии привязываются к этим направлениям. По умолчанию выключено.")
                        .font(.caption).foregroundStyle(.secondary)
                    Toggle("Тактильный отклик жестов", isOn: $haptics)
                    Text("Результат жеста можно отменить кнопкой ↶. Если вы рисуете штриховку или сложные формулы, стирание жестом можно отключить.")
                        .font(.caption).foregroundStyle(.secondary)
                } header: { Text("Умное письмо") }
                Section("Быстрые инструменты") {
                    TextField("Название любимого пера",text:$penName)
                    Button("Запомнить текущее перо") {
                        guard let pen = session.canvas?.tool as? PKInkingTool else { return }
                        var r:CGFloat = 0,g:CGFloat = 0,b:CGFloat = 0,a:CGFloat = 0
                        guard pen.color.resolvedColor(with:UITraitCollection(userInterfaceStyle:.light)).getRed(&r,green:&g,blue:&b,alpha:&a) else { return }
                        guard let type = penTypes.firstIndex(of:pen.inkType) else { return }
                        let item = SavedPen(title:penName,type:type,red:r,green:g,blue:b,alpha:a,width:pen.width)
                        if let data = try? JSONEncoder().encode(pens+[item]) { penData = data; penName = "" }
                    }.disabled(penName.trimmingCharacters(in:.whitespaces).isEmpty || !(session.canvas?.tool is PKInkingTool))
                    ForEach(pens) { item in
                        Button(item.title) {
                            let color = UIColor(red:item.red,green:item.green,blue:item.blue,alpha:item.alpha)
                            guard penTypes.indices.contains(item.type) else { return }
                            let tool = PKInkingTool(penTypes[item.type],color:color,width:item.width)
                            session.laserPointer = false; session.canvas?.tool = tool; session.picker.selectedTool = tool
                            dismiss()
                        }.disabled(session.readOnly)
                    }.onDelete { offsets in
                        var next = pens; next.remove(atOffsets:offsets)
                        if let data = try? JSONEncoder().encode(next) { penData = data }
                    }
                    Toggle("Показывать быстрые ручки", isOn: $showQuickTools)
                    Picker("Толщина быстрых ручек", selection: $quickPenWidth) {
                        Text("Тонкая · 1").tag(1.0)
                        Text("Средняя · 2").tag(2.0)
                        Text("Толстая · 4").tag(4.0)
                    }
                    Text("Чёрная, синяя и красная ручки, жёлтый маркер — под кнопками страниц. Полная настройка инструментов остаётся в системной палитре.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Управление") {
                    Toggle("Рисовать пальцем", isOn: $fingerDrawing)
                    Toggle("Лазерная указка", isOn: $session.laserPointer)
                    Text("Красная точка и след исчезают после отпускания и не попадают в сохранение или PDF. С указкой перемещайте и увеличивайте лист двумя пальцами.")
                        .font(.caption).foregroundStyle(.secondary)
                    Toggle("Режим чтения", isOn: $session.readOnly)
                    Text("В режиме чтения лист можно перемещать одним пальцем. Рисование и изменение содержимого заблокированы; навигация, закладки и экспорт доступны. Последняя открытая страница запоминается автоматически.")
                        .font(.caption).foregroundStyle(.secondary)
                    Text("С клавиатурой: ⌘Z — отмена, ⇧⌘Z — повтор.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.navigationTitle("Письмо и жесты")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
        }
    }
}
