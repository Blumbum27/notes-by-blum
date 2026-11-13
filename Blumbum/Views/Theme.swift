import SwiftUI
import UIKit

enum Theme {
    static let accent = Color(red: 0.12, green: 0.36, blue: 0.33)
    static let paper = Color(red: 0.97, green: 0.96, blue: 0.93)
    static let covers = ["teal", "clay", "blue", "plum", "sand"]
    static func cover(_ key: String) -> Color {
        switch key {
        case "clay": return Color(red: 0.69, green: 0.37, blue: 0.29)
        case "blue": return Color(red: 0.29, green: 0.43, blue: 0.61)
        case "plum": return Color(red: 0.48, green: 0.35, blue: 0.49)
        case "sand": return Color(red: 0.61, green: 0.51, blue: 0.32)
        default: return accent
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct SharedFile: Identifiable {
    let id = UUID()
    let url: URL
}
