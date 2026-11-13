import SwiftUI

struct WritingSettingsView: View {
    @ObservedObject var session: WritingSession
    @Environment(\.dismiss) private var dismiss
    @AppStorage("scribbleErase") private var scribbleErase = true
    @AppStorage("straightenLines") private var straightenLines = false
    @AppStorage("gestureHaptics") private var haptics = true
    @AppStorage("showQuickTools") private var showQuickTools = true
    @AppStorage("quickPenWidth") private var quickPenWidth = 2.0
    @AppStorage("fingerDrawing") private var fingerDrawing = true

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
