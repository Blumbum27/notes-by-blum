import SwiftUI

private struct StudyInterval: Codable, Identifiable {
    var id = UUID()
    let date: Date
    let seconds: Int
}

struct SessionClock: View {
    let notebook: UUID
    @Environment(\.dismiss) private var dismiss
    @State private var start: Date?
    @State private var minutes = 25
    @State private var countdown = true
    @State private var history: [StudyInterval] = []
    private var key: String { "clock." + notebook.uuidString }
    var body: some View {
        NavigationStack {
            Form {
                Picker("Режим",selection:$countdown) {
                    Text("Таймер").tag(true); Text("Секундомер").tag(false)
                }.pickerStyle(.segmented).disabled(start != nil)
                if countdown { Stepper("\(minutes) мин",value:$minutes,in:1...180).disabled(start != nil) }
                TimelineView(.periodic(from:.now,by:1)) { context in
                    let elapsed = max(0,Int(context.date.timeIntervalSince(start ?? context.date)))
                    let value = countdown ? max(0,minutes * 60 - elapsed) : elapsed
                    Text(String(format:"%02d:%02d",value/60,value%60)).font(.largeTitle.monospacedDigit())
                        .onChange(of:value) { _, new in if countdown && new == 0 && start != nil { finish() } }
                }
                Button(start == nil ? "Начать" : "Завершить занятие") {
                    if start != nil { finish() } else {
                        start = .now
                        UserDefaults.standard.set(start,forKey:key+".start")
                        UserDefaults.standard.set(countdown,forKey:key+".countdown")
                        UserDefaults.standard.set(minutes,forKey:key+".minutes")
                    }
                }
                Section("История занятий") {
                    ForEach(history) { session in
                        LabeledContent(session.date.formatted(),value:String(format:"%d:%02d",session.seconds/60,session.seconds%60))
                    }
                }
            }.navigationTitle("Время занятия").toolbar { Button("Готово") { dismiss() } }.onAppear {
                let prefs = UserDefaults.standard
                if let data = prefs.data(forKey:key+".history") { history = (try? JSONDecoder().decode([StudyInterval].self,from:data)) ?? [] }
                if let saved = prefs.object(forKey:key+".start") as? Date {
                    start = saved; countdown = prefs.bool(forKey:key+".countdown"); minutes = max(1,prefs.integer(forKey:key+".minutes"))
                    if countdown && Date().timeIntervalSince(saved) >= Double(minutes*60) { finish() }
                }
            }
        }
    }
    private func finish() {
        guard let start else { return }
        let duration = max(0,Int(Date().timeIntervalSince(start)))
        history.insert(StudyInterval(date:start,seconds:countdown ? min(duration,minutes*60) : duration),at:0)
        if let data = try? JSONEncoder().encode(history) { UserDefaults.standard.set(data,forKey:key+".history") }
        UserDefaults.standard.removeObject(forKey:key+".start")
        self.start = nil
    }
}
