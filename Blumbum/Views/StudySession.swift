import SwiftUI

struct StudySession: View {
    @EnvironmentObject private var store: LibraryStore
    @Environment(\.dismiss) private var dismiss
    let notebookID: UUID
    let pageID: UUID
    @State private var question = ""
    @State private var answer = ""
    @State private var pairs = ""
    @State private var reveal = false
    @State private var feedback = ""
    private var page: NotePage? { store.notebook(notebookID)?.pages.first { $0.id == pageID } }
    var body: some View {
        NavigationStack {
            Form {
                Section("Повторение по тетради") {
                    let due = store.notebook(notebookID)?.pages.flatMap { p in (p.cards ?? []).map { (p.id, $0) } }.first(where: { $0.1.due <= Date() })
                    if let (page, card) = due {
                        Text(card.question).font(.title2)
                        if reveal {
                            Text(card.answer)
                            Button("Знаю") { grade(card,page:page,known:true) }
                            Button("Повторить через минуту") { grade(card,page:page,known:false) }
                        } else { Button("Показать ответ") { reveal = true } }
                    } else { Text("На сегодня всё повторено") }
                }
                Section("Добавить на эту страницу") {
                    TextField("Вопрос", text:$question, axis:.vertical)
                    TextField("Ответ", text:$answer, axis:.vertical)
                    Button("Добавить карточку") {
                        if add([ReviewCard(question:question,answer:answer)]) { question = ""; answer = "" }
                    }.disabled(question.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty || answer.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
                }
                Section("Вставить пары из таблицы") {
                    TextField("Вопрос и ответ через табуляцию, одна строка на карточку",text:$pairs,axis:.vertical)
                    Button("Импорт TSV") {
                        let rows = pairs.split(whereSeparator: \.isNewline)
                        let imported = rows.compactMap { line -> ReviewCard? in
                            let fields = line.split(separator:"\t",omittingEmptySubsequences:false)
                            guard fields.count == 2, fields.allSatisfy({ !$0.trimmingCharacters(in:.whitespaces).isEmpty }) else { return nil }
                            return ReviewCard(question:String(fields[0]),answer:String(fields[1]))
                        }
                        guard !rows.isEmpty, imported.count == rows.count else { feedback = "В каждой строке нужны вопрос и ответ."; return }
                        if add(imported) { pairs = "" }
                    }.disabled(pairs.isEmpty)
                }
                if let cards = page?.cards {
                    Section("Карточки листа") {
                        ForEach(cards) { card in Text(card.question) }
                            .onDelete { offsets in
                                let removed = Set(offsets.map { cards[$0].id })
                                store.updatePage(notebookID,pageID) { $0.cards?.removeAll { removed.contains($0.id) } }
                                reveal = false
                            }
                    }
                }
                if !feedback.isEmpty { Text(feedback) }
            }.navigationTitle("Карточки").toolbar { Button("Готово") { if store.flush() { dismiss() } } }
        }
    }
    private func add(_ cards: [ReviewCard]) -> Bool {
        let saved = store.updatePage(notebookID,pageID) { $0.cards = ($0.cards ?? []) + cards }
        feedback = saved ? "Добавлено: \(cards.count)" : (store.error ?? "Ошибка записи")
        return saved
    }
    private func grade(_ card: ReviewCard,page: UUID,known: Bool) {
        store.updatePage(notebookID,page) { p in
            guard let i = p.cards?.firstIndex(where:{ $0.id == card.id }) else { return }
            let days = known ? min(120,max(1,card.intervalDays * 2)) : 0
            p.cards?[i].intervalDays = days
            p.cards?[i].due = Date().addingTimeInterval(known ? Double(days) * 86400 : 60)
        }
        reveal = false
    }
}
