import Foundation

struct AppConfiguration: Codable {
    var developerName = ""
    var supportEmail = ""
    var privacyPolicyURL = ""
    var supportURL = ""

    static let current: AppConfiguration = {
        guard let url = Bundle.main.url(forResource: "AppConfiguration", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let value = try? JSONDecoder().decode(AppConfiguration.self, from: data) else { return AppConfiguration() }
        return value
    }()

    static func publicURL(_ value: String) -> URL? {
        guard let url = URL(string: value), url.scheme == "https", let host = url.host,
              host.contains("."), host != "localhost", !host.hasSuffix(".example"),
              !host.hasSuffix(".invalid"), !host.hasSuffix(".local"), !host.hasSuffix(".test"),
              !["example.com", "example.org", "example.net"].contains(host),
              !host.split(separator: ".").allSatisfy({ Int($0) != nil }),
              url.user == nil, url.password == nil else { return nil }
        return url
    }
    var privacyURL: URL? { Self.publicURL(privacyPolicyURL) }
    var helpURL: URL? { Self.publicURL(supportURL) }
    var emailURL: URL? {
        guard supportEmail.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil else { return nil }
        return URL(string: "mailto:" + supportEmail)
    }
    var isConfigured: Bool { !developerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && privacyURL != nil && helpURL != nil && emailURL != nil }
    var purchasesAllowed: Bool {
        #if DEBUG
        return true
        #else
        return isConfigured
        #endif
    }
}
