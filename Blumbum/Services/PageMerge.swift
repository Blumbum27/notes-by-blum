import Foundation
import CryptoKit

enum SyncFile {
    static func exchange(_ url: URL, id: UUID, base: [NotePage], local: NotebookArchive?) throws -> NotebookArchive? {
        var outcome: Result<NotebookArchive?, Error>?
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(writingItemAt: url, options: [], error: &coordinationError) { target in
            outcome = Result {
                let manager = FileManager.default
                let decoder = JSONDecoder()
                func read(_ source: URL) throws -> NotebookArchive {
                    let values = try source.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                    guard values.isRegularFile == true, let size = values.fileSize, size <= 100_000_000 else { throw NoteError.invalidFile }
                    let value = try decoder.decode(NotebookArchive.self, from: Data(contentsOf: source, options: .mappedIfSafe))
                    guard value.version == 1, value.notebook.id == id, !value.notebook.pages.isEmpty,
                          Set(value.notebook.pages.map(\.id)).count == value.notebook.pages.count else { throw NoteError.invalidFile }
                    return value
                }
                let remote = manager.fileExists(atPath: target.path) ? try read(target) : nil
                // A missing previously synced document may still be downloading.
                if remote == nil && !base.isEmpty { throw CocoaError(.fileReadNoSuchFile) }
                guard var merged = remote ?? local else { return nil }
                func include(_ other: NotebookArchive, ancestor: [NotePage]) throws {
                    for (name, data) in other.assets {
                        if let existing = merged.assets[name], existing != data { throw NoteError.invalidFile }
                        merged.assets[name] = data
                    }
                    merged.notebook.pages = try PageMerge.merge(base: ancestor, local: merged.notebook.pages, remote: other.notebook.pages)
                }
                if remote != nil, let local { try include(local, ancestor: base) }
                let conflicts = NSFileVersion.unresolvedConflictVersionsOfItem(at: target) ?? []
                for version in conflicts { try include(read(version.url), ancestor: []) }
                let names = Set(merged.notebook.pages.flatMap { $0.images.map(\.asset) + [$0.pdfAsset].compactMap { $0 } })
                guard names.isSubset(of: Set(merged.assets.keys)) else { throw NoteError.invalidFile }
                merged.assets = merged.assets.filter { names.contains($0.key) }
                if remote?.notebook.pages != merged.notebook.pages || remote == nil || !conflicts.isEmpty {
                    let data = try JSONEncoder().encode(merged)
                    guard data.count <= 100_000_000 else { throw CocoaError(.fileWriteOutOfSpace) }
                    try data.write(to: target, options: .atomic)
                    for version in conflicts { version.isResolved = true }
                }
                return merged
            }
        }
        if let coordinationError { throw coordinationError }
        guard let outcome else { throw NoteError.invalidFile }
        return try outcome.get()
    }
}

/// Both peers use the same ordering and identifiers, including after a retry.
enum PageMerge {
    static func merge(base: [NotePage], local: [NotePage], remote: [NotePage]) throws -> [NotePage] {
        if local == remote { return local }
        if local == base { return remote }
        if remote == base { return local }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let original = Dictionary(grouping: base, by: \.id)
        let left = Dictionary(grouping: local, by: \.id)
        let right = Dictionary(grouping: remote, by: \.id)
        guard [original, left, right].allSatisfy({ $0.values.allSatisfy { $0.count == 1 } }) else { throw NoteError.invalidFile }
        // Keep a unilateral reorder. Resolve simultaneous reorders deterministically.
        let a = local.map(\.id), b = remote.map(\.id), old = base.map(\.id)
        let first = a == old ? b : b == old ? a : (a.map(\.uuidString).lexicographicallyPrecedes(b.map(\.uuidString)) ? a : b)
        let ids = Set(a).union(b)
        var result: [NotePage] = []
        for id in first + ids.subtracting(first).sorted(by: { $0.uuidString < $1.uuidString }) {
            let l = left[id]?.first, r = right[id]?.first, ancestor = original[id]?.first
            if l == r || r == ancestor { if let l { result.append(l) }; continue }
            if l == ancestor { if let r { result.append(r) }; continue }
            guard let l, let r else {
                // An edit against a concurrent deletion survives.
                if let survivor = l ?? r { result.append(survivor) }
                continue
            }
            let lhs = try encoder.encode(l), rhs = try encoder.encode(r)
            let leftFirst = lhs.lexicographicallyPrecedes(rhs)
            result.append(leftFirst ? l : r)
            var conflict = leftFirst ? r : l
            let bytes = Array(SHA256.hash(data: leftFirst ? rhs : lhs).prefix(16))
            conflict.id = UUID(uuid: (bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]))
            if !ids.contains(conflict.id) { result.append(conflict) }
            else if ![left[conflict.id]?.first, right[conflict.id]?.first].contains(conflict) { throw NoteError.invalidFile }
        }
        guard !result.isEmpty, result.count <= 2000 else { throw NoteError.invalidFile }
        return result
    }
}
