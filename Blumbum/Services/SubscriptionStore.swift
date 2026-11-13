import Foundation
import StoreKit
import Combine

@MainActor
final class SubscriptionStore: ObservableObject {
    static let productIDs = ["app.blumbum.plus.monthly", "app.blumbum.plus.yearly"]
    @Published private(set) var products: [Product] = []
    @Published private(set) var hasPremium = false
    @Published private(set) var isBusy = false
    @Published private(set) var isReady = false
    @Published var message: String?
    private var listener: Task<Void, Never>?
    private var entitlementTimer: Task<Void, Never>?
    private var refreshGeneration = 0

    init() {
        listener = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let transaction) = result,
                   Self.productIDs.contains(transaction.productID) {
                    await self.refreshEntitlements()
                    await transaction.finish()
                }
            }
        }
        entitlementTimer = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
                await self?.refreshEntitlements()
            }
        }
    }

    deinit { listener?.cancel(); entitlementTimer?.cancel() }

    func load() async {
        await refreshEntitlements()
        isReady = true
        do {
            products = try await Product.products(for: Self.productIDs)
                .filter { $0.type == .autoRenewable && $0.subscription != nil }
                .sorted { $0.price < $1.price }
        } catch { message = "Не удалось загрузить цены: \(error.localizedDescription)" }
    }

    func refreshEntitlements() async {
        refreshGeneration += 1
        let generation = refreshGeneration
        var unlocked = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               Self.productIDs.contains(transaction.productID),
               transaction.revocationDate == nil, !transaction.isUpgraded {
                // currentEntitlements includes subscribed AND inGracePeriod.
                // Rejecting a past expirationDate here would incorrectly end grace access.
                unlocked = true
            }
        }
        if generation == refreshGeneration { hasPremium = unlocked }
    }

    func purchase(_ product: Product) async {
        guard !isBusy, AppConfiguration.current.purchasesAllowed,
              Self.productIDs.contains(product.id), product.type == .autoRenewable else { return }
        isBusy = true
        message = nil
        defer { isBusy = false }
        do {
            switch try await product.purchase() {
            case .success(let result):
                guard case .verified(let transaction) = result else {
                    message = "Не удалось проверить покупку. Попробуйте восстановить покупки."
                    return
                }
                await refreshEntitlements()
                await transaction.finish()
            case .pending: message = "Покупка ожидает подтверждения. Доступ включится после оплаты."
            case .userCancelled: break
            @unknown default: break
            }
        } catch { message = error.localizedDescription }
    }

    func restore() async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await AppStore.sync()
            await refreshEntitlements()
            message = hasPremium ? "Подписка восстановлена." : "Активная подписка не найдена."
        } catch { message = error.localizedDescription }
    }
}
