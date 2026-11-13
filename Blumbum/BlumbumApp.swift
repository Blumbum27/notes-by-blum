import SwiftUI

@main
struct BlumbumApp: App {
    @StateObject private var store = LibraryStore()
    @StateObject private var subscription = SubscriptionStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            LibraryView()
                .environmentObject(store)
                .environmentObject(subscription)
                .tint(Theme.accent)
                .task { store.performMaintenance(); await subscription.load() }
                .onChange(of: scenePhase) { _, phase in
                    if phase != .active { store.flush() }
                    if phase == .active { Task { await subscription.refreshEntitlements() } }
                }
                .alert("Не удалось выполнить действие", isPresented: Binding(
                    get: { store.error != nil },
                    set: { if !$0 { store.error = nil } }
                )) { Button("Понятно") { store.error = nil } } message: { Text(store.error ?? "") }
        }
    }
}
